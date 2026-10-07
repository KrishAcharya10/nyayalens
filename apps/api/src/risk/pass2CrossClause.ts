// Pass 2: cross-clause/cross-entity consistency checking. Unlike Pass 1,
// every check here sees the WHOLE document's clauses/entities at once and
// compares two or more of them - this is the architecturally different
// component docs/research/adversarial_test_design.md called for, not
// "just another risk category" bolted onto Pass 1.
//
// New comparisons are added to a DomainPack's own riskSchema.comparisonChecks
// (domains/rentalPack.ts, domains/landLeasePack.ts) without touching this
// file or pass1PerClause.ts - see apps/api/tests/riskEnginePass2.test.ts's
// "Pass 2 registry extensibility" test for a check that proves exactly
// that by registering a throwaway check and confirming it runs standalone.
//
// Phase 8 Step 2 (docs/phase8/step2_migration_notes.md): this file used to
// own asymmetricObligationCheck and landUseContradictionCheck directly,
// the latter behind an inline `if (context.documentType !== "LAND_LEASE")
// return [];` guard - Step 1's audit flagged that guard as the second
// explicit, literal documentType branch in the codebase. Both checks now
// live in risk/sharedChecks.ts (asymmetricObligationCheck, domain-agnostic,
// registered by both packs) and domains/landLeasePack.ts
// (landUseContradictionCheck, now scoped by pack registration instead of
// an inline guard). This file is a pure, domain-agnostic orchestrator.
//
// COMPARISON_CHECKS is kept only for backward compatibility with
// riskEnginePass2.test.ts's existing import of it (a union of every
// registered pack's comparisonChecks) - runPass2's own default no longer
// uses it; the default resolves the calling context's own pack instead,
// same reasoning as pass1PerClause.ts's runPass1.
import { getDomainPackRegistry } from "../domains/index.js";
import type { RiskCheck, RiskEngineContext, RiskFinding } from "./types.js";

export type ComparisonCheck = RiskCheck;

export const COMPARISON_CHECKS: ComparisonCheck[] = getDomainPackRegistry()
  .list()
  .flatMap((pack) => pack.riskSchema.comparisonChecks);

export function runPass2(
  context: RiskEngineContext,
  checks: ComparisonCheck[] = getDomainPackRegistry().get(context.documentType).riskSchema
    .comparisonChecks,
): RiskFinding[] {
  return checks.flatMap((check) => check.run(context));
}
