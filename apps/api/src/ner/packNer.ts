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
  // "14th day of March, 2025", "14th March 2025", "14 March 2025",
  // "March 14, 2025", "14/03/2025".
  DATE: new RegExp(
    String.raw`\b\d{1,2}(?:st|nd|rd|th)\s+day\s+of\s+(?:${MONTH}),\s+\d{4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTH}),?\s+\d{4}\b|\b(?:${MONTH})\s+\d{1,2},\s+\d{4}\b|\b\d{2}[/.]\d{2}[/.]\d{4}\b`,
    "g",
  ),
  DURATION: new RegExp(
    String.raw`\b(?:(?:${NUMBER_WORD})\s\(\d{1,3}\)|\d{1,3}\s\((?:${NUMBER_WORD})\)|\d{1,3}|(?:${NUMBER_WORD}))\s(?:days?|weeks?|months?|years?)\b`,
    "g",
  ),
  PERCENT: /\b[a-z]+ per cent \(\d+(?:\.\d+)?%\)|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)? percent\b/g,
  AREA: /\b\d[\d,]*(?:\.\d+)?\s(?:sq\.\s?ft\.|sq\.\s?mtrs\.|sq\.\s?yards|square\s+(?:feet|foot|metres?|meters?|yards?)|sq\.?\s?(?:ft|m|mtrs?)\b\.?|acres?|hectares?|guntha|guntas|cents|decimal|bigha|kanal|marla|katha)/g,
};

// Typographic quotes and apostrophes, swapped one character for one so every
// offset in the original text stays valid. Word-processor and PDF text uses
// them ("the “Landlord”", "60 days’ notice"); the rules are written against
// the plain forms.
function plainQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

// A free-text phrase ends where its sentence does: a full stop after a word
// of three or more letters, a digit or a bracket, followed by a capital, a
// digit or an opening bracket (so "a.m. to 6:30 p.m." and "Rs. 25,000" do not
// end it), a semicolon, or a blank line.
const PHRASE_END = /(?<=[a-z]{3,}|\d|\))\.\s+(?=[A-Z(\d])|;\s|\n\n/;

function clipToSentence(value: string): string {
  const cut = value.search(PHRASE_END);
  return cut > 2 ? value.slice(0, cut) : value;
}

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
    let previousEnd = -1;
    for (const m of text.matchAll(VALUE_REGEX[type])) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // Context words describe the value they sit next to: when the sentence
      // already holds an earlier value of this type, the context starts after
      // it ("CTC is INR 6,00,000, made up of a basic salary of INR 25,000"),
      // so the first value's label does not spill onto the next.
      const sentenceBegin = sentenceStart(text, start);
      const before = text.slice(Math.max(sentenceBegin, previousEnd), start);
      previousEnd = end;
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

const HONORIFIC = String.raw`(?:M\/s\.|Mr\.|Mrs\.|Ms\.|Miss|Dr\.|Shri|Sri|Smt\.)`;
// A person's name after an honorific: capitalised words, which stops at
// "of", "residing", a comma or a bracket.
const PERSON_NAME = String.raw`[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4}`;
// A company name, for parties introduced without an honorific.
const ORG_NAME = String.raw`[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z&][A-Za-z0-9&.'-]*){0,6}\s+(?:Pvt\.?\s+Ltd\.?|Private\s+Limited|Limited|LLP|Inc\.?|Corporation|Corp\.?)`;

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
        String.raw`hereinafter\s+(?:jointly\s+)?(?:referred\s+to\s+as|called)\s+the\s+["'“]${t}S?["'”]`,
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
      // Signature line: "Landlord: Ananya Mehta ______   Date: ____".
      for (const m of original.matchAll(
        new RegExp(
          String.raw`(?<![A-Za-z])(?:${t}|${upper}):[ \t]+(${PERSON_NAME})[ \t]*_{2,}`,
          "g",
        ),
      )) {
        pushName(out, label, m[1]!, (m.index ?? 0) + m[0].indexOf(m[1]!), 0.8);
      }
    }
  }
  out.push(...bracketedPartyEntities(text, partyTerms));
  return out;
}

// A trailing full stop belongs to the sentence, not the name ("Mr. A. B. Rao.").
function pushName(
  out: ExtractedEntityCandidate[],
  label: string,
  name: string,
  start: number,
  confidence: number,
): void {
  // ...except an organisation abbreviation ("Pvt. Ltd."), which keeps its stop.
  const keepStop = /\b(?:Ltd|Pvt|Inc|Co|Corp)\.$/.test(name);
  push(out, label, keepStop ? name : name.replace(/\.+$/, ""), start, confidence);
}

// The name comes first and the role is defined in brackets after it:
//   'Ms. Ananya Mehta, residing at 14 Lake View Road, (the "Landlord")'
//   'Mr. Dev Kulkarni of 8 Palm Grove, Mumbai (the "Licensor")'
//   'Acme Technologies Pvt. Ltd. (the "Company")'
// The name is the last honorific-introduced name (or company name) between
// the previous definition and this one.
function bracketedPartyEntities(
  text: string,
  partyTerms: Record<string, string[]>,
): ExtractedEntityCandidate[] {
  const defs: Array<{ label: string; start: number; end: number }> = [];
  for (const [label, terms] of Object.entries(partyTerms)) {
    for (const term of terms.filter((t) => /^[A-Z]/.test(t))) {
      const t = escapeRegex(term).replace(/\\? /g, "\\s+");
      const re = new RegExp(String.raw`\(\s*(?:the\s+)?["']${t}S?["']\s*\)`, "gi");
      for (const m of text.matchAll(re)) {
        defs.push({ label, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
      }
    }
  }
  defs.sort((a, b) => a.start - b.start);
  const out: ExtractedEntityCandidate[] = [];
  defs.forEach((d, i) => {
    const floor = Math.max(defs[i - 1]?.end ?? 0, d.start - 500);
    const window = text.slice(floor, d.start);
    const person = [
      ...window.matchAll(new RegExp(String.raw`${HONORIFIC}\s+(${PERSON_NAME})`, "g")),
    ].pop();
    const org = [...window.matchAll(new RegExp(`(${ORG_NAME})`, "g"))].pop();
    const found = person ?? org;
    if (!found?.[1]) return;
    const start = floor + (found.index ?? 0) + found[0].indexOf(found[1]);
    // A company name ends in its own full stop ("Pvt. Ltd."); a person's does not.
    if (person) pushName(out, d.label, found[1], start, 0.85);
    else push(out, d.label, found[1], start, 0.85);
  });
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
      const captured = m[group];
      if (!captured) continue;
      const value = clipToSentence(captured);
      const offset = m[0].indexOf(captured);
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
  const plain = plainQuotes(canonicalText);
  const unwrapped = plain.replace(/(?<!\n)\n(?!\n)/g, " ");
  const candidates = [
    ...(pack.extraction.partyExtraction === false
      ? []
      : partyEntities(unwrapped, plain, pack.partyTerms)),
    ...(labels.has("WITNESS") ? witnessEntities(plain) : []),
    ...phraseEntities(plain, unwrapped, pack),
    ...valueEntities(unwrapped, pack.extraction.valueRules),
  ];
  return (
    candidates
      .filter((c) => labels.has(c.label) && c.textEnd > c.textStart)
      // The matching views differ from the document only in quote characters;
      // an entity's text is always what the document actually says there.
      .map((c) => ({ ...c, text: canonicalText.slice(c.textStart, c.textEnd) }))
  );
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
