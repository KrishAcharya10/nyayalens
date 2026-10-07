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
import { REGISTRATION_ACT_S17, TPA_S105_LEASE, TPA_S107_LEASE_FORM } from "./legalReferences.js";
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
  id: "residential_rental",
  name: "Residential Rental Agreement",
  description:
    "Residential rent / tenancy agreements between a landlord and a tenant for a dwelling.",
  version: "2026.10.0",

  jurisdiction: {
    country: "IN",
    referenceVersion: "2026-10",
    // No state: nothing in this pack's risk rules makes a state-specific
    // distinction, so it doesn't invent one.
  },

  documentTypes: [
    { id: "RESIDENTIAL_RENTAL", slug: "residential_rental", label: "Residential Rental" },
  ],

  // Attribution verified against research/generator/generator.py's
  // build_residential_rental() (LANDLORD/TENANT/SECURITY_DEPOSIT only
  // ever emitted there) - RENT/DURATION/NOTICE_PERIOD/ADDRESS are shared
  // with land_lease. The labels after ADDRESS are the v2 generator's
  // (research/generator/generator_v2.py) additions for this domain.
  // ADDRESS is the place of execution ("executed at <city>") in both
  // generators, not the property - that is PROPERTY_ADDRESS.
  entitySchema: [
    { label: "LANDLORD", displayName: "Landlord", coreType: "PARTY" },
    { label: "TENANT", displayName: "Tenant", coreType: "PARTY" },
    { label: "RENT", displayName: "Rent", coreType: "MONEY" },
    { label: "SECURITY_DEPOSIT", displayName: "Security deposit", coreType: "MONEY" },
    { label: "DURATION", displayName: "Duration", coreType: "DURATION" },
    { label: "NOTICE_PERIOD", displayName: "Notice period", coreType: "DURATION" },
    { label: "ADDRESS", displayName: "Place of execution", coreType: "LOCATION" },
    { label: "PROPERTY_ADDRESS", displayName: "Property address", coreType: "ADDRESS" },
    { label: "EXECUTION_DATE", displayName: "Execution date", coreType: "DATE" },
    { label: "COMMENCEMENT_DATE", displayName: "Commencement date", coreType: "DATE" },
    { label: "EXPIRY_DATE", displayName: "Expiry date", coreType: "DATE" },
    { label: "ESCALATION_RATE", displayName: "Rent escalation", coreType: "PERCENT" },
    { label: "LOCK_IN_PERIOD", displayName: "Lock-in period", coreType: "DURATION" },
    { label: "WITNESS", displayName: "Witness", coreType: "PERSON" },
  ],

  // Priorities mirror the pre-migration CLAUSE_TAXONOMY array's position
  // (position * 10). Consumed by the clause classifier: a rental
  // document's headings are matched against exactly this list.
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

  // Subject "DOCUMENT" means the agreement itself.
  relationSchema: [
    { relationType: "LETS_TO", subjectEntityLabel: "LANDLORD", objectEntityLabel: "TENANT" },
    { relationType: "MUST_PAY", subjectEntityLabel: "TENANT", objectEntityLabel: "RENT" },
    {
      relationType: "MUST_PAY",
      subjectEntityLabel: "TENANT",
      objectEntityLabel: "SECURITY_DEPOSIT",
    },
    { relationType: "HAS_TERM", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "DURATION" },
    {
      relationType: "HAS_NOTICE_PERIOD",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "NOTICE_PERIOD",
    },
    {
      relationType: "HAS_LOCK_IN",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "LOCK_IN_PERIOD",
    },
    {
      relationType: "STARTS_ON",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "COMMENCEMENT_DATE",
    },
    { relationType: "ENDS_ON", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "EXPIRY_DATE" },
    {
      relationType: "LOCATED_AT",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "PROPERTY_ADDRESS",
    },
  ],

  obligationSchema: [
    { action: "PAY", actorLabels: ["TENANT"], description: "Pay rent / deposit / charges." },
    {
      action: "REFUND_DEPOSIT",
      actorLabels: ["LANDLORD"],
      description: "Return the security deposit.",
    },
    {
      action: "MAINTAIN",
      actorLabels: ["TENANT", "LANDLORD"],
      description: "Carry out repairs or upkeep.",
    },
    {
      action: "SERVE_NOTICE",
      actorLabels: ["TENANT", "LANDLORD"],
      description: "Give notice before terminating.",
    },
    { action: "VACATE", actorLabels: ["TENANT"], description: "Hand back vacant possession." },
  ],

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

  // Filled in by the consistency-engine milestone (docs/domain_packs.md).
  consistencyRules: [],

  detection: {
    titlePatterns: [
      /\bRENT(?:AL)?\s+AGREEMENT\b/i,
      /\bAGREEMENT\s+OF\s+TENANCY\b/i,
      /\bTENANCY\s+AGREEMENT\b/i,
    ],
    lexicalPatterns: [
      /\blandlord\b/i,
      /\btenant\b/i,
      /\bmonthly\s+rent\b/i,
      /\btenancy\b/i,
      /\bresidential\b/i,
    ],
  },

  // Reference metadata only (see legalReferences.ts): the risk rules above
  // still cite no statute, and no reference is ever turned into a finding.
  legalFrameworks: [TPA_S105_LEASE, TPA_S107_LEASE_FORM, REGISTRATION_ACT_S17],

  generatorConfig: { module: "research/generator/generator_v2.py#build_residential_rental" },
};
