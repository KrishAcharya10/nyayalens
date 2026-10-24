// Mirrors a persisted DocumentClause/Entity closely enough for risk-engine
// logic to consume without importing Prisma's full generated types
// everywhere - just the fields any check could need.
export interface ClauseInput {
  id: string;
  clauseType: string;
  clauseNumber: string | null;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export interface EntityInput {
  id: string;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

// documentType is a plain string, not the Prisma DocumentType enum type -
// matching the precedent graph/types.ts's BuildGraphInput already set. The
// DB column itself stays an enum (see docs/phase8/step2_enum_decision.md);
// this only widens how an already-validated value is carried through
// in-memory pipeline code, so a DomainPack's own document-type ids (also
// plain strings) can be compared against it without importing Prisma's
// enum type here.
export interface RiskEngineContext {
  documentId: string;
  documentType: string;
  clauses: ClauseInput[];
  entities: EntityInput[];
  /** The whole canonical text, when the caller has it (lets absence checks read unclassified text). */
  fullText?: string;
  /** The pack's heading patterns by clause type (lets absence checks see multi-topic headings). */
  clauseHeadings?: Record<string, RegExp[]>;
}

export type EvidenceSourceTable = "document_clauses" | "entities";

export interface EvidenceSpan {
  sourceTable: EvidenceSourceTable;
  sourceId: string;
  documentId: string;
  textStart: number | null;
  textEnd: number | null;
  text: string | null;
}

// Kept in sync with the DB RiskCategory enum (packages/db/prisma/schema.prisma).
export type RiskCategory =
  | "LIABILITY_SHIFT"
  | "ASYMMETRIC_OBLIGATION"
  | "UNBOUNDED_DISCRETION"
  | "LAND_USE_CONTRADICTION"
  | "MISSING_CLAUSE"
  // Phase 8 domain risks
  | "ONE_SIDED_REMEDY"
  | "RESTRICTIVE_COVENANT"
  | "UNCAPPED_LIABILITY"
  // Phase 8 consistency findings (pass CONSISTENCY)
  | "FINANCIAL_CONTRADICTION"
  | "DATE_CONTRADICTION"
  | "DURATION_CONTRADICTION"
  | "PROPERTY_AREA_CONTRADICTION"
  | "PROPERTY_IDENTIFIER_CONTRADICTION"
  | "PAYMENT_TOTAL_MISMATCH"
  | "PARTY_ROLE_INCONSISTENCY"
  | "PARTY_NAME_CONTRADICTION"
  | "DEFINITION_INCONSISTENCY";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskPass = "PASS_1" | "PASS_2" | "CONSISTENCY";

export interface RiskFinding {
  category: RiskCategory;
  severity: RiskSeverity;
  // Always "potentially unfavorable / requires review" framing - never a
  // definitive legal judgment. See risk_engine.md and
  // apps/api/src/risk/reasonFraming.ts.
  reason: string;
  pass: RiskPass;
  evidence: EvidenceSpan[];
  /** Phase 8: the rule that produced the finding (consistency rule id or check name). */
  ruleId?: string;
  /** Phase 8: findings are prompts for review, never verdicts. Defaults to true when persisted. */
  reviewRequired?: boolean;
}

// A single risk-engine check, whether per-clause (Pass 1) or cross-clause
// (Pass 2) - both shapes are identical, so one DomainPack risk schema can
// hold either kind in the same list. pass2CrossClause.ts's ComparisonCheck
// is an alias of this (kept for that file's existing exported name).
export interface RiskCheck {
  name: string;
  run(context: RiskEngineContext): RiskFinding[];
}

export function clauseToEvidence(documentId: string, clause: ClauseInput): EvidenceSpan {
  return {
    sourceTable: "document_clauses",
    sourceId: clause.id,
    documentId,
    textStart: clause.textStart,
    textEnd: clause.textEnd,
    text: clause.text,
  };
}

export function entityToEvidence(documentId: string, entity: EntityInput): EvidenceSpan {
  return {
    sourceTable: "entities",
    sourceId: entity.id,
    documentId,
    textStart: entity.textStart,
    textEnd: entity.textEnd,
    text: entity.text,
  };
}
