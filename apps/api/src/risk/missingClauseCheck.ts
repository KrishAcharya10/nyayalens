// Category 5: clean absence (missing clause) - moved out of
// pass1PerClause.ts during the Phase 8 Step 2 DomainPack migration
// (docs/phase8/step2_migration_notes.md). The detection logic itself is
// unchanged from the original pass1PerClause.ts; only its configuration
// (which clause types are expected, and at what severity) is now a
// parameter instead of a `Record<"RESIDENTIAL_RENTAL"|"LAND_LEASE", ...>`
// keyed by the two hardcoded DocumentType enum values - each DomainPack
// supplies its own expectedClauseTypes/missingClauseSeverity to
// makeMissingClauseCheck() instead. This file is domain-agnostic on
// purpose: it has no dependency on any specific pack or on the registry,
// so both rentalPack.ts and landLeasePack.ts can import it without a
// domains/ <-> risk/ import cycle.
import type { RiskCheck, RiskEngineContext, RiskFinding, RiskSeverity } from "./types.js";

export function detectMissingClauses(
  context: RiskEngineContext,
  expectedClauseTypes: string[],
  missingClauseSeverity: Record<string, RiskSeverity>,
): RiskFinding[] {
  const present = new Set(context.clauses.map((c) => c.clauseType));
  const missing = expectedClauseTypes.filter((clauseType) => !present.has(clauseType));

  return missing.map((clauseType) => ({
    category: "MISSING_CLAUSE" as const,
    severity: missingClauseSeverity[clauseType] ?? "MEDIUM",
    reason:
      `No ${clauseType.replace(/_/g, " ").toLowerCase()} clause was found in this document. This may be ` +
      "a potentially significant omission and warrants review before signing.",
    pass: "PASS_1" as const,
    // No single clause to anchor to - that's the whole point of "clean
    // absence." Evidence is empty; the finding is document-level.
    evidence: [],
  }));
}

export function makeMissingClauseCheck(
  expectedClauseTypes: string[],
  missingClauseSeverity: Record<string, RiskSeverity>,
): RiskCheck {
  return {
    name: "missing_clause",
    run: (context) => detectMissingClauses(context, expectedClauseTypes, missingClauseSeverity),
  };
}

// For domains whose document types differ in what they should contain
// (a sale deed has no advance-payment clause; an offer letter has no
// non-compete), expectations are looked up by the document's own type.
// A document type with no entry expects nothing rather than borrowing
// another type's list.
export function makeMissingClauseCheckByDocumentType(
  expectedByDocumentType: Record<string, string[]>,
  missingClauseSeverity: Record<string, RiskSeverity>,
): RiskCheck {
  return {
    name: "missing_clause",
    run: (context) =>
      detectMissingClauses(
        context,
        expectedByDocumentType[context.documentType] ?? [],
        missingClauseSeverity,
      ),
  };
}
