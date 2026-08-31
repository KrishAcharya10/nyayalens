import type { DocumentType } from "@nyayalens/db";

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

export interface RiskEngineContext {
  documentId: string;
  documentType: DocumentType;
  clauses: ClauseInput[];
  entities: EntityInput[];
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

export type RiskCategory =
  | "LIABILITY_SHIFT"
  | "ASYMMETRIC_OBLIGATION"
  | "UNBOUNDED_DISCRETION"
  | "LAND_USE_CONTRADICTION"
  | "MISSING_CLAUSE";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskPass = "PASS_1" | "PASS_2";

export interface RiskFinding {
  category: RiskCategory;
  severity: RiskSeverity;
  // Always "potentially unfavorable / requires review" framing - never a
  // definitive legal judgment. See risk_engine.md and
  // apps/api/src/risk/reasonFraming.ts.
  reason: string;
  pass: RiskPass;
  evidence: EvidenceSpan[];
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
