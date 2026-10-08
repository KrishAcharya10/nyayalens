// Domain-independent, pack-driven rule extraction (Phase 8).
//
// The engine knows only generic shapes:
//   - typed values: money, dates, durations, percentages, areas
//   - party names, from "hereinafter referred to as the "<TERM>"" preamble
//     paragraphs and signature blocks, using the pack's partyTerms
//   - witnesses listed under "WITNESSES:"
// A DomainPack supplies the domain knowledge as data (PackExtraction): which
// sentence context turns a value into which role (valueRules), and phrase
// patterns for free-text fields. No domain names appear in this file.
//
// Like rulePatterns.ts this is a transparent baseline, grounded in the
// surface forms the synthetic generators produce; the held-out-template
// test split measures how far it generalises beyond them.
import type { DomainPack, ValueRule, ValueType } from "../domains/registry.js";
import type { ExtractedEntityCandidate } from "./types.js";

const MODEL_NAME = "nyayalens-pack-rules-v1";

const NUMBER_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|eighteen|twenty|twenty-four|twenty-five|thirty|thirty-three|thirty-six|forty-five|sixty|ninety";
const MONTH =
  "January|February|March|April|May|June|July|August|September|October|November|December";

const VALUE_REGEX: Record<ValueType, RegExp> = {
  MONEY: /(?:₹\s?|Rs\.\s?|INR\s)\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b/g,
  DATE: new RegExp(
    String.raw`\b\d{1,2}(?:st|nd|rd|th)\s+day\s+of\s+(?:${MONTH}),\s+\d{4}\b|\b\d{1,2}(?:st|nd|rd|th)\s+(?:${MONTH})\s+\d{4}\b|\b(?:${MONTH})\s+\d{1,2},\s+\d{4}\b|\b\d{2}[/.]\d{2}[/.]\d{4}\b`,
    "g",
  ),
  DURATION: new RegExp(
    String.raw`\b(?:(?:${NUMBER_WORD})\s\(\d{1,3}\)|\d{1,3}\s\((?:${NUMBER_WORD})\)|\d{1,3}|(?:${NUMBER_WORD}))\s(?:days?|weeks?|months?|years?)\b`,
    "g",
  ),
  PERCENT: /\b[a-z]+ per cent \(\d+(?:\.\d+)?%\)|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)? percent\b/g,
  AREA: /\b\d[\d,]*(?:\.\d+)?\s(?:sq\.\s?ft\.|sq\.\s?mtrs\.|sq\.\s?yards|acres|hectares|guntha|guntas|cents|decimal|bigha|kanal|marla|katha)/g,
};

// A sentence boundary: "; ", a blank line, or ". " after a lowercase word,
// a digit, a closing bracket or the "/-" after an amount - so "Rs. 25,000",
// "Flat No. 7" and "Pvt. Ltd." don't split a sentence.
const BOUNDARY = /;\s|\n\n|(?:[a-z]{3,}|\d|\)|\/-)\.\s+(?=[A-Z(])/g;

function sentenceStart(text: string, pos: number): number {
  const from = Math.max(0, pos - 320);
  let start = from;
  for (const m of text.slice(from, pos).matchAll(BOUNDARY)) {
    start = from + (m.index ?? 0) + m[0].length;
  }
  return start;
}

// What follows a value, minus the "/-" and "(Rupees ... only)" that trail amounts.
function afterContext(text: string, end: number): string {
  return text
    .slice(end, end + 90)
    .replace(/^\/-/, "")
    .replace(/^\s*\(Rupees[^)]*\)/, "");
}

function classifyValue(
  rules: ValueRule[],
  type: ValueType,
  before: string,
  after: string,
  text: string,
): string | null {
  const candidates = rules.filter((r) => r.type === type && (!r.requires || r.requires.test(text)));
  // Context words match regardless of case ("Consideration for the above
  // property:" starts a schedule line).
  const byAfter = candidates.find((r) => r.after && insensitive(r.after).test(after));
  if (byAfter) return byAfter.label;
  return candidates.find((r) => r.before && insensitive(r.before).test(before))?.label ?? null;
}

const insensitiveCache = new WeakMap<RegExp, RegExp>();
function insensitive(re: RegExp): RegExp {
  let out = insensitiveCache.get(re);
  if (!out) {
    out = re.flags.includes("i") ? re : new RegExp(re.source, `${re.flags}i`);
    insensitiveCache.set(re, out);
  }
  return out;
}

function valueEntities(text: string, rules: ValueRule[]): ExtractedEntityCandidate[] {
  const out: ExtractedEntityCandidate[] = [];
  const types = new Set(rules.map((r) => r.type));
  for (const type of types) {
    for (const m of text.matchAll(VALUE_REGEX[type])) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const before = text.slice(sentenceStart(text, start), start);
      const label = classifyValue(rules, type, before, afterContext(text, end), text);
      if (!label) continue; // never label a value with no supporting context
      out.push({
        label,
        text: m[0],
        textStart: start,
        textEnd: end,
        // Context-specific, so it outranks a generic legacy pattern on the same span.
        confidence: 0.95,
        modelName: MODEL_NAME,
      });
    }
  }
  return out;
}

const HONORIFIC = String.raw`(?:M\/s\.|Mr\.|Mrs\.|Ms\.|Shri|Smt\.)`;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function push(
  out: ExtractedEntityCandidate[],
  label: string,
  text: string,
  start: number,
  confidence: number,
): void {
  const trimmed = text.trimEnd();
  out.push({
    label,
    text: trimmed,
    textStart: start,
    textEnd: start + trimmed.length,
    confidence,
    modelName: MODEL_NAME,
  });
}

// Where the paragraph describing a party starts: after "BETWEEN:", after a
// standalone "AND" that introduces the next party, after the previous
// party's "... PART", or after a blank line. Text extracted from PDFs has
// no blank lines between paragraphs, so blank lines alone are not enough.
const PARTY_BOUNDARY =
  /\b(?:between|BETWEEN)\s*:|\bAND\b(?=\s+(?:\(\d\)\s+)?(?:M\/s\.|Mr\.|Mrs\.|Ms\.|Shri|Smt\.|[A-Z][A-Z ]+:))|\bPART\s*[;,.]|\n\n/g;

function partyParagraphStart(text: string, at: number): number {
  const from = Math.max(0, at - 900);
  let start = from;
  for (const m of text.slice(from, at).matchAll(PARTY_BOUNDARY)) {
    start = from + (m.index ?? 0) + m[0].length;
  }
  while (start < at && /\s/.test(text[start]!)) start++;
  return start;
}

// `text` is the line-unwrapped view (preamble paragraphs); `original` keeps
// line structure for signature blocks.
function partyEntities(
  text: string,
  original: string,
  partyTerms: Record<string, string[]>,
): ExtractedEntityCandidate[] {
  const out: ExtractedEntityCandidate[] = [];
  for (const [label, terms] of Object.entries(partyTerms)) {
    for (const term of terms.filter((t) => /^[A-Z]/.test(t))) {
      const t = escapeRegex(term).replace(/\\? /g, "\\s+");
      // Preamble: the paragraph that ends "hereinafter referred to as the "TERM"".
      const defined = new RegExp(
        String.raw`hereinafter\s+(?:jointly\s+)?referred\s+to\s+as\s+the\s+["'“]${t}S?["'”]`,
        "gi",
      );
      for (const m of text.matchAll(defined)) {
        const at = m.index ?? 0;
        const paraStart = partyParagraphStart(text, at);
        const para = text.slice(paraStart, at);
        const joint = [
          ...para.matchAll(new RegExp(String.raw`\(\d\)\s+${HONORIFIC}\s+([^,\n]+),`, "g")),
        ];
        if (joint.length > 0) {
          for (const j of joint)
            push(out, label, j[1]!, paraStart + (j.index ?? 0) + j[0].indexOf(j[1]!), 0.85);
          continue;
        }
        const single = new RegExp(String.raw`^(?:[A-Z][A-Z ]+:\s+|${HONORIFIC}\s+)([^,\n]+),`).exec(
          para,
        );
        if (single?.[1])
          push(out, label, single[1], paraStart + single[0].indexOf(single[1]), 0.85);
      }
      // Signature blocks: "TERM\n(Name)" and "For and on behalf of the TERM\nName".
      const upper = escapeRegex(term.toUpperCase()).replace(/\\? /g, "\\s+");
      for (const m of original.matchAll(
        new RegExp(String.raw`^${upper}[ \t]*\n\(([^)\n]+)\)`, "gm"),
      )) {
        push(out, label, m[1]!, (m.index ?? 0) + m[0].indexOf("(") + 1, 0.8);
      }
      for (const m of original.matchAll(
        new RegExp(String.raw`^For and on behalf of the ${t}[ \t]*\n([^\n]+?)[ \t]*$`, "gm"),
      )) {
        push(out, label, m[1]!, (m.index ?? 0) + m[0].lastIndexOf(m[1]!), 0.8);
      }
    }
  }
  return out;
}

function witnessEntities(text: string): ExtractedEntityCandidate[] {
  const at = text.indexOf("WITNESSES:");
  if (at < 0) return [];
  const out: ExtractedEntityCandidate[] = [];
  for (const m of text
    .slice(at)
    .matchAll(/^\d\.\s+([A-Z][A-Za-z.' ]+?)(?:,\s+[A-Z][A-Za-z. ]+)?$/gm)) {
    push(out, "WITNESS", m[1]!, at + (m.index ?? 0) + m[0].indexOf(m[1]!), 0.7);
  }
  return out;
}

function phraseEntities(
  text: string,
  unwrapped: string,
  pack: DomainPack<unknown, unknown>,
): ExtractedEntityCandidate[] {
  const out: ExtractedEntityCandidate[] = [];
  for (const p of pack.extraction?.phrasePatterns ?? []) {
    const group = p.group ?? 1;
    for (const m of (p.lines ? text : unwrapped).matchAll(p.regex)) {
      const value = m[group];
      if (!value) continue;
      const offset = m[0].indexOf(value);
      push(out, p.label, value, (m.index ?? 0) + offset, p.confidence ?? 0.7);
    }
  }
  return out;
}

/** Every pack-driven candidate (before overlap resolution / label filtering). */
export function runPackNer(
  canonicalText: string,
  pack: DomainPack<unknown, unknown>,
): ExtractedEntityCandidate[] {
  if (!pack.extraction) return [];
  const labels = new Set(pack.entitySchema.map((e) => e.label));
  // Hard line-wraps (as in PDF-extracted or scanned text) break phrases
  // mid-sentence. Context matching runs on a view where a single newline is
  // a space - a 1:1 character swap, so every offset is still valid in the
  // original. Paragraph breaks ("\n\n") are kept.
  const unwrapped = canonicalText.replace(/(?<!\n)\n(?!\n)/g, " ");
  const candidates = [
    ...(pack.extraction.partyExtraction === false
      ? []
      : partyEntities(unwrapped, canonicalText, pack.partyTerms)),
    ...(labels.has("WITNESS") ? witnessEntities(canonicalText) : []),
    ...phraseEntities(canonicalText, unwrapped, pack),
    ...valueEntities(unwrapped, pack.extraction.valueRules),
  ];
  return candidates.filter((c) => labels.has(c.label) && c.textEnd > c.textStart);
}

/**
 * Whether `text` contains a value of the given core type (money, date,
 * duration, percentage, area). Core types without a value shape (parties,
 * free text) always pass. Used by /ask to require that retrieved evidence
 * for a value question actually contains such a value.
 */
export function containsValueOfType(text: string, coreType: string): boolean {
  const re = VALUE_REGEX[coreType as ValueType];
  if (!re) return true;
  return new RegExp(re.source, re.flags.replace("g", "")).test(text);
}
