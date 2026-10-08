// The Semantic Fact Layer (Phase 8): one normalized representation that the
// consistency engine, knowledge graph, RAG, document comparison and
// summaries all read, instead of each re-interpreting raw entities.
//
// Facts are derived on demand from persisted rows (entities, clauses,
// relations, obligations), not stored: they are a deterministic function
// of those rows, so storing them would only create a second copy that
// could drift. Every fact carries document_id, domain, source clause,
// page, character offsets, evidence text and model_source.
import type { DomainPack } from "../domains/registry.js";
import { clauseAt, type ExtractedObligation, type ExtractedRelation } from "./extract.js";
import { normalizeByCoreType, type NormalizedValue } from "./normalize.js";
import type { PageSpan, SemanticClause, SemanticEntity } from "./types.js";

export type FactSource = "ENTITY" | "RELATION" | "OBLIGATION";

export interface SemanticFact {
  id: string;
  documentId: string;
  domain: string;
  factType: FactSource;
  subject: string;
  subjectText: string | null;
  predicate: string;
  object: string;
  objectText: string | null;
  qualifiers: Record<string, string>;
  normalizedValue: NormalizedValue | null;
  sourceClauseId: string | null;
  sourceClauseType: string | null;
  page: number | null;
  textStart: number;
  textEnd: number;
  evidenceText: string;
  modelSource: string;
}

export interface TemporalFact {
  type: string;
  entityId: string;
  text: string;
  normalized: NormalizedValue | null;
  textStart: number;
  textEnd: number;
  page: number | null;
}

export interface FinancialFact {
  type: string;
  entityId: string;
  text: string;
  amountInr: number | null;
  currency: "INR";
  textStart: number;
  textEnd: number;
  page: number | null;
}

export interface SemanticFactSet {
  facts: SemanticFact[];
  temporal: TemporalFact[];
  financial: FinancialFact[];
}

/** Page spans from page texts joined the way the pipeline builds canonicalText ("\n\n"). */
export function pageSpans(pages: { pageNumber: number; text: string | null }[]): PageSpan[] {
  const spans: PageSpan[] = [];
  let offset = 0;
  for (const p of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    if (p.text === null) continue;
    spans.push({ pageNumber: p.pageNumber, textStart: offset, textEnd: offset + p.text.length });
    offset += p.text.length + 2;
  }
  return spans;
}

export function pageAt(pages: PageSpan[], offset: number): number | null {
  return pages.find((p) => p.textStart <= offset && offset <= p.textEnd)?.pageNumber ?? null;
}

export interface BuildFactsInput {
  documentId: string;
  pack: DomainPack<unknown, unknown>;
  text: string;
  pages: PageSpan[];
  entities: SemanticEntity[];
  clauses: SemanticClause[];
  relations: ExtractedRelation[];
  obligations: ExtractedObligation[];
}

export function buildSemanticFacts(input: BuildFactsInput): SemanticFactSet {
  const { documentId, pack, text, pages, entities, clauses } = input;
  const coreType = new Map(pack.entitySchema.map((e) => [e.label, e.coreType]));
  const byId = new Map(entities.map((e) => [e.id, e]));
  const norm = (e: SemanticEntity) => normalizeByCoreType(coreType.get(e.label) ?? "TEXT", e.text);
  const clauseType = (offset: number) => clauseAt(clauses, offset);
  const facts: SemanticFact[] = [];

  for (const r of input.relations) {
    const obj = byId.get(r.objectEntityId);
    if (!obj) continue;
    const subj = r.subjectEntityId ? byId.get(r.subjectEntityId) : undefined;
    const clause = clauseType(obj.textStart);
    facts.push({
      id: `fact-${facts.length}`,
      documentId,
      domain: pack.id,
      factType: "RELATION",
      subject: r.subjectLabel,
      subjectText: subj?.text ?? null,
      predicate: r.relationType,
      object: r.objectLabel,
      objectText: obj.text,
      qualifiers: {},
      normalizedValue: norm(obj),
      sourceClauseId: clause?.id ?? null,
      sourceClauseType: clause?.clauseType ?? null,
      page: pageAt(pages, obj.textStart),
      textStart: obj.textStart,
      textEnd: obj.textEnd,
      evidenceText: text.slice(obj.textStart, obj.textEnd),
      modelSource: obj.modelSource ?? "RULE_BASED",
    });
  }

  for (const o of input.obligations) {
    const actor = o.actorEntityId ? byId.get(o.actorEntityId) : undefined;
    const amount = o.amountEntityId ? byId.get(o.amountEntityId) : undefined;
    const qualifiers: Record<string, string> = {};
    if (o.deadlineIso) qualifiers.deadline = o.deadlineIso;
    if (o.frequency) qualifiers.frequency = o.frequency;
    if (o.condition) qualifiers.condition = o.condition;
    if (o.amountLabel) qualifiers.purpose = o.amountLabel;
    if (o.unexpectedActor) qualifiers.reviewNote = "actor not expected for this action";
    const clause = clauseType(o.textStart);
    facts.push({
      id: `fact-${facts.length}`,
      documentId,
      domain: pack.id,
      factType: "OBLIGATION",
      subject: o.actorLabel,
      subjectText: actor?.text ?? o.actorText,
      predicate: `MUST_${o.action}`,
      object: o.amountLabel ?? o.action,
      objectText: amount?.text ?? null,
      qualifiers,
      normalizedValue: amount ? norm(amount) : null,
      sourceClauseId: clause?.id ?? null,
      sourceClauseType: clause?.clauseType ?? null,
      page: pageAt(pages, o.textStart),
      textStart: o.textStart,
      textEnd: o.textEnd,
      evidenceText: o.evidenceText,
      modelSource: "RULE_BASED",
    });
  }

  // Every labeled value is also a fact about the document (DOCUMENT HAS_<LABEL> value),
  // so a value no relation mentions is still queryable.
  for (const e of entities) {
    const clause = clauseType(e.textStart);
    facts.push({
      id: `fact-${facts.length}`,
      documentId,
      domain: pack.id,
      factType: "ENTITY",
      subject: "DOCUMENT",
      subjectText: null,
      predicate: `HAS_${e.label}`,
      object: e.label,
      objectText: e.text,
      qualifiers: {},
      normalizedValue: norm(e),
      sourceClauseId: clause?.id ?? null,
      sourceClauseType: clause?.clauseType ?? null,
      page: pageAt(pages, e.textStart),
      textStart: e.textStart,
      textEnd: e.textEnd,
      evidenceText: e.text,
      modelSource: e.modelSource ?? "RULE_BASED",
    });
  }

  const temporal: TemporalFact[] = [];
  const financial: FinancialFact[] = [];
  for (const e of entities) {
    const ct = coreType.get(e.label);
    const page = pageAt(pages, e.textStart);
    if (ct === "DATE" || ct === "DURATION") {
      temporal.push({
        type: e.label,
        entityId: e.id,
        text: e.text,
        normalized: norm(e),
        textStart: e.textStart,
        textEnd: e.textEnd,
        page,
      });
    } else if (ct === "MONEY") {
      const v = norm(e);
      financial.push({
        type: e.label,
        entityId: e.id,
        text: e.text,
        amountInr: v && "amount" in v ? v.amount : null,
        currency: "INR",
        textStart: e.textStart,
        textEnd: e.textEnd,
        page,
      });
    }
  }
  return { facts, temporal, financial };
}
