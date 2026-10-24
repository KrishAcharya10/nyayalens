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
import { BODY_CUES } from "../clauses/clauseTaxonomy.js";
import type { RiskCheck, RiskEngineContext, RiskFinding, RiskSeverity } from "./types.js";

export function detectMissingClauses(
  context: RiskEngineContext,
  expectedClauseTypes: string[],
  missingClauseSeverity: Record<string, RiskSeverity>,
  coveredBy: Record<string, string[]> = {},
): RiskFinding[] {
  const present = new Set(context.clauses.map((c) => c.clauseType));
  // A clause type also counts as present when a classified clause's heading
  // line names it as well ("DESIGNATION AND JOINING", "Term and Termination"),
  // or when the text carries wording that type is recognised by even though
  // its heading is unfamiliar ("Courts", "Obligations"). An unfamiliar heading
  // must not by itself produce an absence finding.
  const covers = (clauseType: string): boolean => {
    const headings = context.clauseHeadings?.[clauseType] ?? [];
    if (headings.length > 0) {
      for (const c of context.clauses) {
        const heading = (c.text ?? "").split("\n", 1)[0] ?? "";
        if (headings.some((h) => h.test(heading))) return true;
      }
    }
    const cue = BODY_CUES[clauseType];
    if (cue && context.fullText && cue.test(context.fullText)) return true;
    return false;
  };
  // A document with no recognisable clause structure at all (a short letter)
  // cannot be judged for missing clauses.
  if (context.fullText !== undefined && context.clauses.length === 0) {
    const unstructured = expectedClauseTypes.filter((t) => !covers(t));
    if (unstructured.length === expectedClauseTypes.length) return [];
  }
  // An expected clause is not missing when a broader clause that contains it is
  // present (an "advance" and a "balance" are covered by a "payment schedule").
  const missing = expectedClauseTypes.filter(
    (clauseType) =>
      !present.has(clauseType) &&
      !(coveredBy[clauseType] ?? []).some((c) => present.has(c)) &&
      !covers(clauseType),
  );

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
  coveredBy: Record<string, string[]> = {},
): RiskCheck {
  return {
    name: "missing_clause",
    run: (context) =>
      detectMissingClauses(
        context,
        expectedByDocumentType[context.documentType] ?? [],
        missingClauseSeverity,
        coveredBy,
      ),
  };
}
