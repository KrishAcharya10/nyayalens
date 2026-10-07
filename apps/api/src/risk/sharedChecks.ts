// Risk checks that are genuinely domain-agnostic - moved out of
// pass2CrossClause.ts during the Phase 8 Step 2 DomainPack migration
// (docs/phase8/step2_migration_notes.md). asymmetricObligationCheck was
// already domain-agnostic by construction before this migration (Step 1's
// audit, "Pass 2" section, noted it never branched on documentType) - it
// simply looks for two party-tagged NOTICE_PERIOD clauses in the same
// document, regardless of which domain that document belongs to. Both
// residentialRentalPack and landLeasePack register this same check
// instance in their riskSchema.comparisonChecks, rather than one pack
// arbitrarily owning it (see the migration notes for why forcing an
// owner here would be an arbitrary, undocumented choice this migration
// deliberately avoided).
//
// Logic is unchanged from the original pass2CrossClause.ts - only its
// location moved, so both rentalPack.ts and landLeasePack.ts can import it
// without a domains/ <-> risk/ import cycle (pass2CrossClause.ts itself
// now only orchestrates; it no longer owns any check implementation).
import type { ClauseInput, EntityInput, RiskCheck } from "./types.js";
import { clauseToEvidence } from "./types.js";

// Matches both "(LANDLORD)" and "- LANDLORD" - the generator uses a hyphen
// (research/generator/adversarial_generator.py) because the clause
// segmenter's heading regex doesn't allow parentheses, but unit tests
// construct ClauseInput.text by hand using parens, so both must work.
const PARTY_TAG_PATTERN = /[(-]\s*(LANDLORD|TENANT|LESSOR|LESSEE)\b/i;
const NOTICE_DAYS_PATTERN = /(\d{1,3})\s+days?/i;

// A meaningfully asymmetric pair: the larger requirement is at least 2x
// the smaller AND at least 10 days more - both conditions guard against
// flagging trivial, immaterial differences (e.g. 30 vs 35 days) as if
// they were the same kind of problem as 15 vs 60. Documented, not
// implicit - see risk_engine.md.
const ASYMMETRY_MIN_RATIO = 2.0;
const ASYMMETRY_MIN_ABSOLUTE_DIFFERENCE_DAYS = 10;

function partyTag(clause: ClauseInput): string | null {
  const match = PARTY_TAG_PATTERN.exec(clause.text ?? "");
  return match?.[1] ? match[1].toUpperCase() : null;
}

function noticeDaysWithin(clause: ClauseInput, entities: EntityInput[]): number | null {
  const nested = entities.find(
    (e) =>
      e.label === "NOTICE_PERIOD" &&
      e.textStart !== null &&
      e.textEnd !== null &&
      clause.textStart !== null &&
      clause.textEnd !== null &&
      e.textStart >= clause.textStart &&
      e.textEnd <= clause.textEnd,
  );
  if (!nested?.text) return null;
  const match = NOTICE_DAYS_PATTERN.exec(nested.text);
  return match?.[1] ? Number(match[1]) : null;
}

export const asymmetricObligationCheck: RiskCheck = {
  name: "asymmetric_obligation_notice_period",
  run(context) {
    const noticeClauses = context.clauses.filter(
      (c) => c.clauseType === "NOTICE_PERIOD" && partyTag(c),
    );
    if (noticeClauses.length < 2) return [];

    const byParty = new Map<string, { clause: ClauseInput; days: number }>();
    for (const clause of noticeClauses) {
      const party = partyTag(clause);
      const days = noticeDaysWithin(clause, context.entities);
      if (party && days !== null && !byParty.has(party)) {
        byParty.set(party, { clause, days });
      }
    }

    // Compare the two sides regardless of exact party-name pairing
    // (LANDLORD/TENANT or LESSOR/LESSEE) - any two distinct parties in
    // the same document are the two sides of the same agreement.
    const sorted = [...byParty.values()].sort((x, y) => x.days - y.days);
    const a = sorted[0];
    const b = sorted[1];
    if (!a || !b) return [];

    const ratio = b.days / a.days;
    const difference = b.days - a.days;
    if (ratio < ASYMMETRY_MIN_RATIO || difference < ASYMMETRY_MIN_ABSOLUTE_DIFFERENCE_DAYS)
      return [];

    return [
      {
        category: "ASYMMETRIC_OBLIGATION",
        severity: ratio >= 3 ? "HIGH" : "MEDIUM",
        reason:
          `The notice periods required from each party differ substantially (${a.days} days vs ${b.days} ` +
          "days) for what appears to be the same kind of termination right. This may be a potentially " +
          "unfavorable imbalance and warrants review before signing.",
        pass: "PASS_2",
        evidence: [
          clauseToEvidence(context.documentId, a.clause),
          clauseToEvidence(context.documentId, b.clause),
        ],
      },
    ];
  },
};
