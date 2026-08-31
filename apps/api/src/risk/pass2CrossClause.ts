// Pass 2: cross-clause/cross-entity consistency checking. Unlike Pass 1,
// every check here sees the WHOLE document's clauses/entities at once and
// compares two or more of them - this is the architecturally different
// component docs/research/adversarial_test_design.md called for, not
// "just another risk category" bolted onto Pass 1.
//
// New comparisons are added to COMPARISON_CHECKS below without touching
// pass1PerClause.ts or anything else in this file - see
// apps/api/tests/pass2Registry.test.ts for a test that proves this by
// registering a throwaway check and confirming it runs standalone.
import type { ClauseInput, EntityInput, RiskEngineContext, RiskFinding } from "./types.js";
import { clauseToEvidence, entityToEvidence } from "./types.js";

export interface ComparisonCheck {
  name: string;
  run(context: RiskEngineContext): RiskFinding[];
}

// --- Category 2: asymmetric obligations (both document types) -----------
// Looks for two NOTICE_PERIOD clauses in the same document, each
// party-tagged in its heading ("(LANDLORD)"/"(TENANT)" or
// "(LESSOR)"/"(LESSEE)" - see research/generator/adversarial_generator.py),
// and compares the notice-period entity value nested inside each.

// Matches both "(LANDLORD)" and "- LANDLORD" - the generator uses a hyphen
// (research/generator/adversarial_generator.py) because the clause
// segmenter's heading regex doesn't allow parentheses, but unit tests below
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

const asymmetricObligationCheck: ComparisonCheck = {
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

// --- Category 4: land use contradiction (land_lease only) ---------------
// Compares the LAND_USE_TYPE entity's value against the LAND_USE_RESTRICTION
// clause's described permitted use.

const NON_AGRICULTURAL_USE_PATTERNS = [
  /warehouse/i,
  /commercial retail/i,
  /industrial/i,
  /construction of/i,
];

const landUseContradictionCheck: ComparisonCheck = {
  name: "land_use_type_vs_permitted_use",
  run(context) {
    if (context.documentType !== "LAND_LEASE") return [];

    const landUseTypeEntity = context.entities.find((e) => e.label === "LAND_USE_TYPE");
    const restrictionClause = context.clauses.find((c) => c.clauseType === "LAND_USE_RESTRICTION");
    if (!landUseTypeEntity?.text || !restrictionClause?.text) return [];

    const isAgricultural =
      /agricultural/i.test(landUseTypeEntity.text) &&
      !/non-agricultural/i.test(landUseTypeEntity.text);
    if (!isAgricultural) return [];

    const describesNonAgriculturalUse = NON_AGRICULTURAL_USE_PATTERNS.some((p) =>
      p.test(restrictionClause.text ?? ""),
    );
    if (!describesNonAgriculturalUse) return [];

    // No conversion clause exists anywhere in this generator's output, so
    // there's nothing further to check for its absence here - see
    // adversarial_test_design.md category 4's construction note.
    return [
      {
        category: "LAND_USE_CONTRADICTION",
        severity: "HIGH",
        reason:
          "The land is classified as Agricultural, but the permitted-use clause describes a use that " +
          "typically requires non-agricultural land conversion, with no conversion clause present in " +
          "this document. This may be a potentially significant inconsistency and warrants review " +
          "before signing.",
        pass: "PASS_2",
        evidence: [
          entityToEvidence(context.documentId, landUseTypeEntity),
          clauseToEvidence(context.documentId, restrictionClause),
        ],
      },
    ];
  },
};

export const COMPARISON_CHECKS: ComparisonCheck[] = [
  asymmetricObligationCheck,
  landUseContradictionCheck,
];

export function runPass2(
  context: RiskEngineContext,
  checks: ComparisonCheck[] = COMPARISON_CHECKS,
): RiskFinding[] {
  return checks.flatMap((check) => check.run(context));
}
