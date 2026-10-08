// One pure entry point for everything downstream of entity + clause
// extraction: relations, obligations, semantic facts, risk findings
// (Pass 1, Pass 2, consistency). The pipeline (jobs/pipeline.ts,
// risk/runRiskEngine.ts) and the offline evaluation harness
// (scripts/evaluate-v3.mjs) both call this, so what is evaluated is
// exactly what runs.
import type { DomainPack } from "../domains/registry.js";
import { runConsistency } from "../consistency/engine.js";
import { runPass1 } from "../risk/pass1PerClause.js";
import { runPass2 } from "../risk/pass2CrossClause.js";
import { dedupeFindings } from "../risk/dedupe.js";
import type { ClauseInput, RiskEngineContext, RiskFinding } from "../risk/types.js";
import { extractObligations, extractRelations } from "./extract.js";
import { buildSemanticFacts, type SemanticFactSet } from "./facts.js";
import type { PageSpan, SemanticClause, SemanticEntity } from "./types.js";

export interface AnalyzeInput {
  documentId: string;
  documentType: string;
  pack: DomainPack<RiskEngineContext, RiskFinding>;
  text: string;
  pages?: PageSpan[];
  entities: SemanticEntity[];
  clauses: Array<SemanticClause & { text: string | null }>;
}

export interface AnalyzeResult {
  relations: ReturnType<typeof extractRelations>;
  obligations: ReturnType<typeof extractObligations>;
  semantic: SemanticFactSet;
  findings: RiskFinding[];
}

export function analyzeText(input: AnalyzeInput): AnalyzeResult {
  const { documentId, pack, text, entities, clauses } = input;
  const relations = extractRelations(pack, entities, clauses);
  const obligations = extractObligations(pack, text, entities, clauses);
  const semantic = buildSemanticFacts({
    documentId,
    pack,
    text,
    pages: input.pages ?? [{ pageNumber: 1, textStart: 0, textEnd: text.length }],
    entities,
    clauses,
    relations,
    obligations,
  });
  const context: RiskEngineContext = {
    documentId,
    documentType: input.documentType,
    clauses: clauses.map((c): ClauseInput => ({
      id: c.id,
      clauseType: c.clauseType,
      clauseNumber: c.clauseNumber,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
    })),
    entities: entities.map((e) => ({ ...e })),
  };
  const findings = dedupeFindings([
    ...runPass1(context, pack.riskSchema),
    ...runPass2(context, pack.riskSchema.comparisonChecks),
    ...runConsistency({ documentId, pack, text, entities, obligations }),
  ]);
  return { relations, obligations, semantic, findings };
}
