// Pass 1: per-clause risk classification. Every check here only ever
// looks at ONE clause (or, for missing-clause, the document's clause-type
// set) - no cross-clause/cross-entity comparison. That belongs to Pass 2
// (pass2CrossClause.ts) - see docs/architecture/risk_engine.md for why
// this split exists and docs/research/adversarial_test_design.md for the
// five categories this project defined.
import type { ClauseInput, RiskEngineContext, RiskFinding } from "./types.js";
import { clauseToEvidence } from "./types.js";

// --- Category 1: silent liability shift (residential_rental only - land
// leases in this generator have no MAINTENANCE clause to shift, see
// risk_engine.md's scoping note) -----------------------------------------

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

// --- Category 3: vague discretionary language (residential_rental only -
// this generator has no refundable-deposit concept for land leases) ------

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

// --- Category 5: clean absence (missing clause) --------------------------
// Document-level (looks at the SET of clause types present), but still a
// Pass 1 concern per adversarial_test_design.md: it never compares one
// clause's content against another's, just checks presence/absence.

const EXPECTED_CLAUSE_TYPES: Record<"RESIDENTIAL_RENTAL" | "LAND_LEASE", string[]> = {
  RESIDENTIAL_RENTAL: [
    "LEASE_DURATION",
    "RENT_PAYMENT",
    "SECURITY_DEPOSIT",
    "TERMINATION",
    "DISPUTE_RESOLUTION",
    "JURISDICTION",
  ],
  LAND_LEASE: [
    "LEASE_DURATION",
    "LEASE_PREMIUM",
    "RENT_PAYMENT",
    "LAND_USE_RESTRICTION",
    "TERMINATION",
    "DISPUTE_RESOLUTION",
    "JURISDICTION",
  ],
};

// Missing which clause type implies which severity - a missing dispute/
// jurisdiction clause is a real gap but a well-known one Indian courts
// often fill by default rule; a missing deposit/premium or termination
// clause leaves a materially bigger, more document-specific gap.
const MISSING_CLAUSE_SEVERITY: Record<string, RiskFinding["severity"]> = {
  DISPUTE_RESOLUTION: "MEDIUM",
  JURISDICTION: "MEDIUM",
  SECURITY_DEPOSIT: "HIGH",
  LEASE_PREMIUM: "HIGH",
  TERMINATION: "HIGH",
  LEASE_DURATION: "HIGH",
  RENT_PAYMENT: "HIGH",
  LAND_USE_RESTRICTION: "MEDIUM",
};

function detectMissingClauses(context: RiskEngineContext): RiskFinding[] {
  const expected = EXPECTED_CLAUSE_TYPES[context.documentType];
  const present = new Set(context.clauses.map((c) => c.clauseType));
  const missing = expected.filter((clauseType) => !present.has(clauseType));

  return missing.map((clauseType) => ({
    category: "MISSING_CLAUSE" as const,
    severity: MISSING_CLAUSE_SEVERITY[clauseType] ?? "MEDIUM",
    reason:
      `No ${clauseType.replace(/_/g, " ").toLowerCase()} clause was found in this document. This may be ` +
      "a potentially significant omission and warrants review before signing.",
    pass: "PASS_1" as const,
    // No single clause to anchor to - that's the whole point of "clean
    // absence." Evidence is empty; the finding is document-level.
    evidence: [],
  }));
}

export function runPass1(context: RiskEngineContext): RiskFinding[] {
  return [
    ...detectLiabilityShift(context.documentId, context.clauses),
    ...detectUnboundedDiscretion(context.documentId, context.clauses),
    ...detectMissingClauses(context),
  ];
}
