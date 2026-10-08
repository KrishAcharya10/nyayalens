// Question analysis over the semantic layer (Phase 8 local RAG, step 1).
//
// Before falling back to BM25 retrieval, a question is matched against the
// document's own facts: "Who is the buyer?" -> the BUYER entity; "Is the
// licence fee stated consistently?" -> consistency findings for that label;
// "How much remains after the advance?" -> SALE_CONSIDERATION - ADVANCE.
// Matching uses the pack's display names plus question-word cues ("when"
// -> a date, "how much" -> money); no domain-specific question list lives
// here. Every answer carries its evidence spans; when the document has no
// fact for the question the answer is NOT_SUFFICIENT, never a guess.
import type { DomainPack } from "../domains/registry.js";
import { normalizeByCoreType, type NormalizedValue } from "../semantic/normalize.js";
import type { SemanticEntity } from "../semantic/types.js";
import type { RiskFinding } from "../risk/types.js";

export type EvidenceStatus = "GROUNDED" | "NOT_SUFFICIENT";

export interface StructuredEvidence {
  entityId: string | null;
  textStart: number;
  textEnd: number;
  text: string;
}

export interface StructuredAnswer {
  status: EvidenceStatus;
  answer: string;
  /** What the question was resolved to, for transparency. */
  resolvedLabels: string[];
  kind: "fact" | "list" | "difference" | "consistency" | "not_found";
  normalized: NormalizedValue | NormalizedValue[] | null;
  evidence: StructuredEvidence[];
}

const STOP = new Set([
  "what",
  "is",
  "the",
  "a",
  "an",
  "of",
  "who",
  "are",
  "and",
  "does",
  "do",
  "how",
  "much",
  "many",
  "long",
  "when",
  "where",
  "which",
  "in",
  "for",
  "this",
  "to",
  "be",
  "by",
  "it",
  "agreement",
  "document",
  "stated",
  "consistently",
  "throughout",
  "remains",
  "remain",
  "after",
  "payable",
  "due",
  "under",
]);

const CUE_TYPES: Array<[RegExp, string[]]> = [
  [/^\s*who\b/i, ["PARTY", "PERSON", "ORGANIZATION"]],
  [/^\s*when\b/i, ["DATE"]],
  [/\bhow long\b|\bhow many (?:days|months|years)\b|\bperiod\b|\bsurvive\b/i, ["DURATION"]],
  [/\bhow much\b|\bamount\b|\bfee\b|\bprice\b|\bsalary\b|\brent\b|\bdeposit\b/i, ["MONEY"]],
  [/^\s*where\b/i, ["ADDRESS", "LOCATION"]],
  [/\bby how much\b|\bincrease\b|\bpercent/i, ["PERCENT"]],
];

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/licen[cs]e/g, "licence")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// Light, symmetric stemming (applied to questions and to label vocabulary
// alike) so "joining"/"join", "commence"/"commencement", "expire"/"expiry"
// and "classified"/"classification" meet.
function stem(w: string): string {
  if (w.length <= 4) return w.replace(/s$/, "");
  return w
    .replace(/(?:ification|ified|ify)$/, "if")
    .replace(/(?:ment|ing|ed|s)$/, "")
    .replace(/[ey]$/, "");
}

interface LabelInfo {
  label: string;
  coreType: string;
  vocab: Set<string>;
}

function labelVocab(pack: DomainPack<unknown, unknown>): LabelInfo[] {
  return pack.entitySchema.map((e) => ({
    label: e.label,
    coreType: e.coreType,
    vocab: new Set([
      ...words(e.displayName),
      ...words(e.label.replace(/_/g, " ")),
      ...(pack.partyTerms[e.label] ?? []).flatMap(words),
    ]),
  }));
}

function scoreLabel(info: LabelInfo, qWords: string[], cueTypes: string[]): number {
  const overlap = qWords.filter((w) => info.vocab.has(w)).length;
  if (overlap === 0) return 0;
  const cue = cueTypes.length === 0 || cueTypes.includes(info.coreType) ? 1 : 0;
  return overlap * 2 + cue - info.vocab.size * 0.01;
}

function cuesFor(question: string): string[] {
  return CUE_TYPES.filter(([re]) => re.test(question)).flatMap(([, t]) => t);
}

/** The best-matching label of one pack and its score (score 0 = no match). */
export function bestLabel(
  pack: DomainPack<unknown, unknown>,
  question: string,
): { label: string | null; score: number } {
  const qWords = words(question);
  const cueTypes = cuesFor(question);
  let best: { label: string | null; score: number } = { label: null, score: 0 };
  for (const v of labelVocab(pack)) {
    const s = scoreLabel(v, qWords, cueTypes);
    if (s > best.score) best = { label: v.label, score: s };
  }
  return best;
}

/** Labels a question asks about, best first (empty when nothing in the ontology matches). */
export function resolveLabels(pack: DomainPack<unknown, unknown>, question: string): string[] {
  const parts = question.split(/\band\b/i);
  const pick = (q: string) => bestLabel(pack, q).label;
  if (parts.length > 1) {
    const labels = parts.map(pick).filter((l): l is string => l !== null);
    if (new Set(labels).size > 1) return [...new Set(labels)];
  }
  const one = pick(question);
  return one ? [one] : [];
}

function ev(e: SemanticEntity): StructuredEvidence {
  return { entityId: e.id, textStart: e.textStart, textEnd: e.textEnd, text: e.text };
}

export interface StructuredQaInput {
  question: string;
  pack: DomainPack<unknown, unknown>;
  entities: SemanticEntity[];
  findings: RiskFinding[];
  /**
   * Every registered pack. When a question clearly asks for a field that only
   * another domain has ("probation period" of a sale deed), the answer is
   * NOT_SUFFICIENT rather than whatever retrieval happens to quote.
   */
  allPacks?: readonly DomainPack<unknown, unknown>[];
}

/**
 * Returns null when the question does not map onto the ontology at all
 * (the caller then falls back to retrieval), or an answer whose status is
 * GROUNDED (with evidence) or NOT_SUFFICIENT.
 */
export function answerStructured(input: StructuredQaInput): StructuredAnswer | null {
  const { question, pack, entities, findings } = input;
  const coreType = new Map(pack.entitySchema.map((e) => [e.label, e.coreType]));
  const display = new Map(pack.entitySchema.map((e) => [e.label, e.displayName]));
  const own = bestLabel(pack, question);
  if (input.allPacks) {
    const ownLabels = new Set(pack.entitySchema.map((e) => e.label));
    for (const other of input.allPacks) {
      if (other.id === pack.id) continue;
      const theirs = bestLabel(other, question);
      if (theirs.label && !ownLabels.has(theirs.label) && theirs.score >= own.score + 2) {
        const name =
          other.entitySchema.find((e) => e.label === theirs.label)?.displayName ?? theirs.label;
        return {
          status: "NOT_SUFFICIENT",
          answer: `This ${pack.name.toLowerCase()} does not contain a ${name.toLowerCase()} - that is a term of a different kind of document.`,
          resolvedLabels: [theirs.label],
          kind: "not_found",
          normalized: null,
          evidence: [],
        };
      }
    }
  }
  const labels = resolveLabels(pack, question);
  if (labels.length === 0) return null;
  const mentions = (label: string) =>
    entities.filter((e) => e.label === label).sort((a, b) => a.textStart - b.textStart);
  const notFound = (resolved: string[]): StructuredAnswer => ({
    status: "NOT_SUFFICIENT",
    answer: `The document does not state the ${resolved.map((l) => (display.get(l) ?? l).toLowerCase()).join(" or the ")}.`,
    resolvedLabels: resolved,
    kind: "not_found",
    normalized: null,
    evidence: [],
  });

  // "Is X stated consistently ...?"
  if (/\bconsistent(?:ly)?\b|\bcontradict|\bconflict/i.test(question)) {
    const label = labels[0]!;
    const found = mentions(label);
    if (found.length === 0) return notFound([label]);
    const ids = new Set(found.map((m) => m.id));
    const conflict = findings.find(
      (f) => f.pass === "CONSISTENCY" && f.evidence.some((e) => ids.has(e.sourceId)),
    );
    return {
      status: "GROUNDED",
      answer: conflict
        ? `No - ${conflict.reason}`
        : `Yes - every mention of the ${(display.get(label) ?? label).toLowerCase()} in the document gives the same value.`,
      resolvedLabels: [label],
      kind: "consistency",
      normalized: null,
      evidence: conflict
        ? conflict.evidence.map((e) => ({
            entityId: e.sourceId,
            textStart: e.textStart ?? 0,
            textEnd: e.textEnd ?? 0,
            text: e.text ?? "",
          }))
        : found.map(ev),
    };
  }

  // "How much ... remains after the advance?" - a difference of two amounts.
  const afterAt = question.search(/\bafter\b/i);
  if (/\bremain|\bleft\b|\boutstanding\b/i.test(question) && afterAt > 0) {
    // "How much of <total> remains after <part>?"
    const money = new Set(
      pack.entitySchema.filter((e) => e.coreType === "MONEY").map((e) => e.label),
    );
    const total = bestLabel(pack, question.slice(0, afterAt)).label;
    const part = bestLabel(pack, question.slice(afterAt)).label;
    if (part && total && part !== total && money.has(part) && money.has(total)) {
      const t = mentions(total)[0]!;
      const p = mentions(part)[0];
      if (!p) return notFound([part]);
      const tv = normalizeByCoreType("MONEY", t.text);
      const pv = normalizeByCoreType("MONEY", p.text);
      if (tv && pv && "amount" in tv && "amount" in pv) {
        const diff = tv.amount - pv.amount;
        return {
          status: "GROUNDED",
          answer: `INR ${diff.toLocaleString("en-IN")} (the ${display.get(total)?.toLowerCase()} of ${t.text} less the ${display.get(part)?.toLowerCase()} of ${p.text}).`,
          resolvedLabels: [total, part],
          kind: "difference",
          normalized: { amount: diff, currency: "INR" },
          evidence: [ev(t), ev(p)],
        };
      }
    }
  }

  if (labels.length > 1) {
    const found = labels.map((l) => mentions(l)[0]);
    if (found.some((m) => !m)) return notFound(labels.filter((_, i) => !found[i]));
    return {
      status: "GROUNDED",
      answer: labels.map((l, i) => `${display.get(l)}: ${found[i]!.text}`).join("; "),
      resolvedLabels: labels,
      kind: "list",
      normalized: found
        .map((m, i) => normalizeByCoreType(coreType.get(labels[i]!) ?? "TEXT", m!.text))
        .filter((v): v is NormalizedValue => v !== null),
      evidence: found.map((m) => ev(m!)),
    };
  }

  const label = labels[0]!;
  const found = mentions(label);
  if (found.length === 0) return notFound([label]);
  const isParty = coreType.get(label) === "PARTY";
  const values = isParty ? [...new Map(found.map((m) => [m.text, m])).values()] : [found[0]!];
  return {
    status: "GROUNDED",
    answer: values.map((m) => m.text).join(" and "),
    resolvedLabels: [label],
    kind: "fact",
    normalized: normalizeByCoreType(coreType.get(label) ?? "TEXT", values[0]!.text),
    evidence: values.map(ev),
  };
}
