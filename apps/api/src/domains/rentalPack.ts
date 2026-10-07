// The residential_rental DomainPack - Phase 8 Step 2 migration
// (docs/phase8/step2_migration_notes.md has the full attribution table
// and how it was verified against research/generator/generator.py and
// adversarial_generator.py, not guessed).
//
// detectLiabilityShift/detectUnboundedDiscretion moved here verbatim from
// the pre-migration pass1PerClause.ts (same regexes, same reason text, same
// severities) - research/generator/adversarial_generator.py's own header
// comment already documented these as "residential_rental only" (this
// generator's land_lease documents have no MAINTENANCE clause or
// refundable deposit concept), so attributing them to this pack only
// (rather than leaving them in a shared, implicitly-scoped file) makes
// that existing scoping explicit and registry-driven instead of implicit.
import type { DomainPack } from "./registry.js";
import { asymmetricObligationCheck } from "../risk/sharedChecks.js";
import { makeMissingClauseCheck } from "../risk/missingClauseCheck.js";
import { clauseToEvidence } from "../risk/types.js";
import type { ClauseInput, RiskCheck, RiskEngineContext, RiskFinding } from "../risk/types.js";

// --- Category 1: silent liability shift ------------------------------------

// \s+ everywhere a literal space would otherwise sit - reportlab's PDF text
// flow can wrap a line mid-phrase ("structural repairs\nshall be borne by
// the Tenant."), and canonical_text preserves that newline rather than
// collapsing it back to a space.
const STRUCTURAL_REPAIRS_PARTY =
  /structural\s+repairs\s+shall\s+be\s+(?:borne|undertaken)\s+by(?:\s+the)?\s+(Tenant|Landlord)/i;

function detectLiabilityShift(documentId: string, clauses: ClauseInput[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const clause of clauses) {
    if (clause.clauseType !== "MAINTENANCE" || !clause.text) continue;
    const match = STRUCTURAL_REPAIRS_PARTY.exec(clause.text);
    if (!match) continue;
    if ((match[1] ?? "").toLowerCase() !== "tenant") continue; // borne by Landlord is the normal allocation

    findings.push({
      category: "LIABILITY_SHIFT",
      severity: "HIGH",
      reason:
        "This maintenance clause assigns structural repairs to the Tenant - normally a Landlord's " +
        "responsibility. This may be a potentially unfavorable shift of liability and warrants review " +
        "before signing.",
      pass: "PASS_1",
      evidence: [clauseToEvidence(documentId, clause)],
    });
  }
  return findings;
}

const liabilityShiftCheck: RiskCheck = {
  name: "liability_shift_structural_repairs",
  run: (context: RiskEngineContext) => detectLiabilityShift(context.documentId, context.clauses),
};

// --- Category 3: vague discretionary language ------------------------------

const DISCRETIONARY_PHRASES = [
  /as deemed fit by/i,
  /at the sole discretion of/i,
  /as determined solely by/i,
];

function detectUnboundedDiscretion(documentId: string, clauses: ClauseInput[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const clause of clauses) {
    if (clause.clauseType !== "SECURITY_DEPOSIT" || !clause.text) continue;
    const matchedPhrase = DISCRETIONARY_PHRASES.find((p) => p.test(clause.text ?? ""));
    if (!matchedPhrase) continue;

    findings.push({
      category: "UNBOUNDED_DISCRETION",
      severity: "MEDIUM",
      reason:
        "This clause lets deposit deductions be decided at one party's discretion, with no itemized " +
        "list or cap mentioned. This may be a potentially unfavorable lack of an objective standard and " +
        "warrants review before signing.",
      pass: "PASS_1",
      evidence: [clauseToEvidence(documentId, clause)],
    });
  }
  return findings;
}

const unboundedDiscretionCheck: RiskCheck = {
  name: "unbounded_discretion_deposit_deduction",
  run: (context: RiskEngineContext) =>
    detectUnboundedDiscretion(context.documentId, context.clauses),
};

// --- Expected clauses / missing-clause severities --------------------------
// Verbatim from the pre-migration EXPECTED_CLAUSE_TYPES.RESIDENTIAL_RENTAL
// and the residential-relevant entries of MISSING_CLAUSE_SEVERITY in the
// old pass1PerClause.ts.

const EXPECTED_CLAUSE_TYPES = [
  "LEASE_DURATION",
  "RENT_PAYMENT",
  "SECURITY_DEPOSIT",
  "TERMINATION",
  "DISPUTE_RESOLUTION",
  "JURISDICTION",
];

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  DISPUTE_RESOLUTION: "MEDIUM",
  JURISDICTION: "MEDIUM",
  SECURITY_DEPOSIT: "HIGH",
  TERMINATION: "HIGH",
  LEASE_DURATION: "HIGH",
  RENT_PAYMENT: "HIGH",
};

export const residentialRentalPack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "RESIDENTIAL_RENTAL",
  name: "Residential Rental Agreement",
  version: "2026.09.0",

  jurisdiction: {
    country: "IN",
    referenceVersion: "2026-09",
    // No state/legalFrameworkId: nothing in the pre-migration risk rules
    // made a state-specific distinction, so this pack doesn't invent one.
  },

  documentTypes: [{ id: "RESIDENTIAL_RENTAL", label: "Residential Rental" }],

  // Attribution verified against research/generator/generator.py's
  // build_residential_rental() (LANDLORD/TENANT/SECURITY_DEPOSIT only
  // ever emitted there) - RENT/DURATION/NOTICE_PERIOD/ADDRESS are shared
  // with land_lease (also emitted by build_land_lease()/adversarial
  // generator's shared preamble/notice-period helpers) and appear in both
  // packs' entitySchema identically.
  entitySchema: [
    { label: "LANDLORD", displayName: "Landlord" },
    { label: "TENANT", displayName: "Tenant" },
    { label: "RENT", displayName: "Rent" },
    { label: "SECURITY_DEPOSIT", displayName: "Security deposit" },
    { label: "DURATION", displayName: "Duration" },
    { label: "NOTICE_PERIOD", displayName: "Notice period" },
    { label: "ADDRESS", displayName: "Property address" },
  ],

  // Priorities mirror the pre-migration CLAUSE_TAXONOMY array's position
  // (position * 10) so relative match order among shared clause types is
  // unchanged - see docs/phase8/step2_migration_notes.md for why this is
  // descriptive data only in this step (clauseTaxonomy.ts itself is not
  // yet wired to consume it).
  clauseSchema: [
    { clauseType: "LEASE_DURATION", headingPattern: /DURATION/i, priority: 20 },
    { clauseType: "SECURITY_DEPOSIT", headingPattern: /DEPOSIT/i, priority: 30 },
    { clauseType: "RENT_PAYMENT", headingPattern: /RENT/i, priority: 40 },
    { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i, priority: 50 },
    { clauseType: "MAINTENANCE", headingPattern: /MAINTENANCE/i, priority: 60 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION/i, priority: 100 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE/i, priority: 110 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION/i, priority: 120 },
  ],

  relationSchema: [], // unpopulated for both live domains - see Step 1 audit §4.6

  riskSchema: {
    expectedClauseTypes: EXPECTED_CLAUSE_TYPES,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      liabilityShiftCheck,
      unboundedDiscretionCheck,
      makeMissingClauseCheck(EXPECTED_CLAUSE_TYPES, MISSING_CLAUSE_SEVERITY),
    ],
    // asymmetricObligationCheck is domain-agnostic (Step 1 audit) - both
    // packs register the SAME check instance rather than one pack
    // arbitrarily owning it.
    comparisonChecks: [asymmetricObligationCheck],
  },

  legalFrameworks: [],
  // Deliberately empty: the pre-migration risk rules don't cite a specific
  // statute per rule, so this pack doesn't invent one - see
  // docs/phase8/domainpack_design.md §5's worked example, which made the
  // same call for the same reason.
};
