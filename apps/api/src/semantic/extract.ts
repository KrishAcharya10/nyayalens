// Relation and obligation extraction (Phase 8) - rule-based, driven by the
// document's DomainPack, over already-extracted entities and clauses.
//
// Relations: schema-driven. For each relation type the pack declares
// (SUBJECT -TYPE-> OBJECT), the subject is the document itself or the
// first mention of the subject role, and each distinct value of the object
// role becomes one relation. A transparent baseline: it relies on the
// ontology (a sale's SELLER is the one who SELLS) rather than reading
// syntax, so it cannot notice text that says the opposite - that is the
// consistency engine's job (EXPECTED_ACTOR rules over obligations).
//
// Obligations: sentence-level. A sentence with a modal ("shall", "will",
// "agrees to", ...) whose actor is a party term of this pack ("the Buyer",
// "the Licensee", "you") becomes ACTOR -ACTION-> (amount, deadline,
// frequency, condition), with the sentence as evidence.
import { segmentClauses, type ClauseSegment } from "../clauses/clauseSegmenter.js";
import type { DomainPack } from "../domains/registry.js";
import { normalizeByCoreType, valueKey } from "./normalize.js";
import { DEFAULT_VERB_PATTERNS } from "./obligationVerbs.js";
import type { SemanticClause, SemanticEntity } from "./types.js";

const RELATION_MODEL = "nyayalens-schema-relations-v1";
const OBLIGATION_MODEL = "nyayalens-rule-obligations-v1";

export interface ExtractedRelation {
  relationType: string;
  subjectLabel: string;
  /** Null when the subject is the document itself. */
  subjectEntityId: string | null;
  objectLabel: string;
  objectEntityId: string;
  sourceClauseId: string | null;
  textStart: number;
  textEnd: number;
  modelName: string;
}

export interface ExtractedObligation {
  actorLabel: string;
  actorEntityId: string | null;
  /** The words the document used for the actor ("the Vendor", "you"). */
  actorText: string;
  action: string;
  /** True when the pack does not expect this actor for this action (a possible role inconsistency). */
  unexpectedActor: boolean;
  amountEntityId: string | null;
  amountLabel: string | null;
  amountInr: number | null;
  deadlineEntityId: string | null;
  deadlineIso: string | null;
  deadlineText: string | null;
  frequency: "MONTHLY" | "ANNUAL" | null;
  condition: string | null;
  sourceClauseId: string | null;
  textStart: number;
  textEnd: number;
  evidenceText: string;
  modelName: string;
}

function coreTypes(pack: DomainPack<unknown, unknown>): Map<string, string> {
  return new Map(pack.entitySchema.map((e) => [e.label, e.coreType]));
}

export function clauseAt(clauses: SemanticClause[], offset: number): SemanticClause | null {
  return clauses.find((c) => c.textStart <= offset && offset < c.textEnd) ?? null;
}

export function extractRelations(
  pack: DomainPack<unknown, unknown>,
  entities: SemanticEntity[],
  clauses: SemanticClause[],
): ExtractedRelation[] {
  const types = coreTypes(pack);
  const sorted = [...entities].sort((a, b) => a.textStart - b.textStart);
  const out: ExtractedRelation[] = [];
  for (const rel of pack.relationSchema) {
    const subject =
      rel.subjectEntityLabel === "DOCUMENT"
        ? null
        : sorted.find((e) => e.label === rel.subjectEntityLabel);
    if (rel.subjectEntityLabel !== "DOCUMENT" && !subject) continue;
    const seen = new Set<string>();
    for (const obj of sorted.filter((e) => e.label === rel.objectEntityLabel)) {
      const key = valueKey(normalizeByCoreType(types.get(obj.label) ?? "TEXT", obj.text));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        relationType: rel.relationType,
        subjectLabel: rel.subjectEntityLabel,
        subjectEntityId: subject?.id ?? null,
        objectLabel: obj.label,
        objectEntityId: obj.id,
        sourceClauseId: clauseAt(clauses, obj.textStart)?.id ?? null,
        textStart: obj.textStart,
        textEnd: obj.textEnd,
        modelName: RELATION_MODEL,
      });
    }
  }
  return out;
}

// --- sentences -----------------------------------------------------------------------

const SENTENCE_END = /;\s|\n\n|(?:[a-z]{3,}|\d|\)|\/-)\.\s+(?=[A-Z(])|\.\s*$/g;

export interface Sentence {
  start: number;
  end: number;
  text: string;
}

/**
 * Sentence spans over the original text (offsets valid in `text`).
 *
 * A sentence never crosses a clause boundary or swallows a heading: headings
 * ("TITLE OF THE SELLER") carry no full stop, so without this the first
 * sentence of a clause would begin with its heading, and the last one would
 * end with the next clause's number ("... today. 3.").
 */
export function sentences(text: string): Sentence[] {
  const cuts = new Set<number>([0, text.length]);
  for (const c of segmentClauses(text)) {
    cuts.add(c.textStart);
    cuts.add(headingEnd(text, c));
  }
  const bounds = [...cuts].sort((a, b) => a - b);
  const out: Sentence[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    sentencesWithin(text, bounds[i]!, bounds[i + 1]!, out);
  }
  return out;
}

// Where a clause's heading stops: the end of its first line, or - for an inline
// heading ("4. Security Deposit: The Tenant shall ...") - just after its colon.
function headingEnd(text: string, clause: ClauseSegment): number {
  const lineEnd = text.indexOf("\n", clause.textStart);
  const end = lineEnd < 0 || lineEnd > clause.textEnd ? clause.textEnd : lineEnd;
  const line = text.slice(clause.textStart, end);
  const at = line.indexOf(clause.heading);
  const afterHeading = at < 0 ? -1 : at + clause.heading.length;
  return afterHeading >= 0 && /^:\s+\S/.test(line.slice(afterHeading))
    ? clause.textStart + afterHeading + 1
    : end;
}

function sentencesWithin(text: string, from: number, to: number, out: Sentence[]): void {
  const zone = text.slice(from, to);
  const unwrapped = zone.replace(/(?<!\n)\n(?!\n)/g, " ");
  let start = 0;
  for (const m of unwrapped.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].trimEnd().length;
    pushSentence(text, out, from + start, from + end);
    start = (m.index ?? 0) + m[0].length;
  }
  pushSentence(text, out, from + start, to);
}

function pushSentence(text: string, out: Sentence[], start: number, end: number): void {
  let s = start;
  while (s < end && /\s/.test(text[s]!)) s++;
  if (end - s > 3) out.push({ start: s, end, text: text.slice(s, end) });
}

// --- obligations ----------------------------------------------------------------------

const MODAL = /\b(?:shall|will|agrees to|must|undertakes to)\b/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TermMatch {
  label: string;
  index: number;
  text: string;
}

function partyTermMatches(sentence: string, partyTerms: Record<string, string[]>): TermMatch[] {
  const out: TermMatch[] = [];
  for (const [label, terms] of Object.entries(partyTerms)) {
    for (const term of terms) {
      const re =
        term === "you"
          ? /\byou\b/gi
          : new RegExp(String.raw`\bthe\s+${escapeRegex(term).replace(/\\? /g, "\\s+")}\b`, "gi");
      for (const m of sentence.matchAll(re)) out.push({ label, index: m.index ?? 0, text: m[0] });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function verbPatterns(pack: DomainPack<unknown, unknown>): Array<[string, RegExp]> {
  const declared = new Map(pack.obligationSchema.map((o) => [o.action, o]));
  const ordered: Array<[string, RegExp]> = [];
  for (const [action, pattern] of DEFAULT_VERB_PATTERNS) {
    const o = declared.get(action);
    if (o) ordered.push([action, o.verbPattern ?? pattern]);
  }
  // Pack-specific actions not in the default lexicon, if they bring their own pattern.
  for (const o of pack.obligationSchema) {
    if (o.verbPattern && !ordered.some(([a]) => a === o.action))
      ordered.push([o.action, o.verbPattern]);
  }
  return ordered;
}

export function extractObligations(
  pack: DomainPack<unknown, unknown>,
  text: string,
  entities: SemanticEntity[],
  clauses: SemanticClause[],
): ExtractedObligation[] {
  const types = coreTypes(pack);
  const verbs = verbPatterns(pack);
  const allowedActors = new Map(
    pack.obligationSchema.map((o) => [o.action, new Set(o.actorLabels)]),
  );
  const partyLabelsInDoc = new Set(
    entities.filter((e) => types.get(e.label) === "PARTY").map((e) => e.label),
  );
  const firstMention = (label: string) =>
    entities.filter((e) => e.label === label).sort((a, b) => a.textStart - b.textStart)[0] ?? null;
  const out: ExtractedObligation[] = [];

  for (const s of sentences(text)) {
    const flat = s.text.replace(/\s+/g, " ");
    const modal = MODAL.exec(s.text);
    if (!modal) continue;
    const modalAt = modal.index;
    if (
      /\bnot\b/i.test(s.text.slice(modalAt, modalAt + 20)) &&
      !/not take up employment/i.test(flat)
    ) {
      continue; // prohibitions ("shall not sublet") are not modelled as obligations
    }
    // Actor: the nearest party term before the modal; for a passive
    // sentence ("shall be paid by the Buyer"), the first one after it.
    const terms = partyTermMatches(s.text, pack.partyTerms);
    let actor: TermMatch | undefined = [...terms].reverse().find((t) => t.index < modalAt);
    if (!actor && /^\s*be\b/i.test(s.text.slice(modalAt + modal[0].length))) {
      const by = /\bby\s+/i.exec(s.text.slice(modalAt));
      if (by) actor = terms.find((t) => t.index >= modalAt + by.index);
    }
    let actorLabel = actor?.label ?? null;
    let actorText = actor?.text ?? "";
    if (!actorLabel && /\b(?:each|either) party\b/i.test(s.text.slice(0, modalAt))) {
      // "Each party shall ..." - attributable only if one party role is present.
      const candidates = [...partyLabelsInDoc];
      if (candidates.length === 1) {
        actorLabel = candidates[0]!;
        actorText = "Each party";
      }
    }
    if (!actorLabel) continue;

    const predicate = s.text.slice(modalAt);
    const verb = verbs.find(([, re]) => re.test(predicate));
    if (!verb) continue;
    const [action] = verb;

    const inside = entities
      .filter((e) => e.textStart >= s.start && e.textEnd <= s.end)
      .sort((a, b) => a.textStart - b.textStart);
    const amount = inside.find((e) => types.get(e.label) === "MONEY") ?? null;
    const deadline = inside.find((e) => types.get(e.label) === "DATE") ?? null;
    const amountValue = amount ? normalizeByCoreType("MONEY", amount.text) : null;
    const deadlineValue = deadline ? normalizeByCoreType("DATE", deadline.text) : null;
    const frequency =
      /\bper month\b|\beach (?:english calendar )?month\b|\bevery month\b|\bmonthly\b/i.test(flat)
        ? "MONTHLY"
        : /\bper annum\b|\beach year\b|\bevery (?:calendar )?year\b|\bannual\b|\byearly\b/i.test(
              flat,
            ) && action !== "PAY_DELAY_COMPENSATION"
          ? "ANNUAL"
          : null;
    const condition = /\b(?:if|in the event|upon|on)\s+([^,;.]{3,80})/i.exec(flat)?.[1] ?? null;

    out.push({
      actorLabel,
      actorEntityId: firstMention(actorLabel)?.id ?? null,
      actorText,
      action,
      unexpectedActor: !(allowedActors.get(action)?.has(actorLabel) ?? false),
      amountEntityId: amount?.id ?? null,
      amountLabel: amount?.label ?? null,
      amountInr: amountValue && "amount" in amountValue ? amountValue.amount : null,
      deadlineEntityId: deadline?.id ?? null,
      deadlineIso: deadlineValue && "iso" in deadlineValue ? deadlineValue.iso : null,
      deadlineText: deadline?.text ?? null,
      frequency,
      condition,
      sourceClauseId: clauseAt(clauses, s.start)?.id ?? null,
      textStart: s.start,
      textEnd: s.end,
      evidenceText: s.text,
      modelName: OBLIGATION_MODEL,
    });
  }
  return out;
}
