// Pass 1: per-clause risk classification. Every check here only ever
// looks at ONE clause (or, for missing-clause, the document's clause-type
// set) - no cross-clause/cross-entity comparison. That belongs to Pass 2
// (pass2CrossClause.ts) - see docs/architecture/risk_engine.md for why
// this split exists and docs/research/adversarial_test_design.md for the
// five categories this project defined.
//
// Phase 8 Step 2 (docs/phase8/step2_migration_notes.md): this file used to
// own detectLiabilityShift/detectUnboundedDiscretion/detectMissingClauses
// directly, keyed by a hardcoded `EXPECTED_CLAUSE_TYPES: Record<"RESIDENTIAL_RENTAL"|"LAND_LEASE",
// string[]>` - Step 1's audit flagged this as the single most literal,
// compiler-enforced two-domain branch in the codebase. Those check
// implementations now live in domains/rentalPack.ts and
// risk/missingClauseCheck.ts; this file is a pure, domain-agnostic
// orchestrator that runs whatever riskSchema.perClauseChecks it's given.
//
// runPass1's second parameter defaults to a registry lookup keyed by
// context.documentType, not a branch - the real pipeline (runRiskEngine.ts)
// always resolves the pack itself and passes riskSchema explicitly; the
// default exists only so runPass1(context) remains callable with a single
// argument, exactly as riskEnginePass1.test.ts already does and was not
// authorized to change.
import { dedupeFindings } from "./dedupe.js";
import { getDomainPackRegistry } from "../domains/index.js";
import type { RiskRuleDescriptor } from "../domains/registry.js";
import type { RiskEngineContext, RiskFinding } from "./types.js";

export function runPass1(
  context: RiskEngineContext,
  riskSchema: RiskRuleDescriptor<
    RiskEngineContext,
    RiskFinding
  > = getDomainPackRegistry().forDocumentType(context.documentType).riskSchema,
): RiskFinding[] {
  return dedupeFindings(riskSchema.perClauseChecks.flatMap((check) => check.run(context)));
}
