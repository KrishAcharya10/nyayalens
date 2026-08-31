// Clause type taxonomy for the rule/heuristic classifier (Phase 4A).
// LEASE_DURATION, RENT_PAYMENT, SECURITY_DEPOSIT, NOTICE_PERIOD,
// MAINTENANCE, TERMINATION, DISPUTE_RESOLUTION, JURISDICTION,
// LEASE_PREMIUM, LAND_USE_RESTRICTION, and ENCUMBRANCE_DECLARATION are
// grounded in research/generator/generator.py's actual clause headings.
// CROP_OR_CULTIVATION_RIGHTS is an extension requested beyond what the
// generator produces - untested against synthetic ground truth, since no
// synthetic document contains it (see extraction_pipeline.md).
//
// Order matters: a heading is tested against these in order and the
// first match wins, so more specific patterns are listed first (e.g.
// LEASE_PREMIUM's "PREMIUM" before RENT_PAYMENT's "RENT" - a heading
// like "ANNUAL LEASE RENT" must not be caught by a premium-adjacent
// pattern, and "LEASE PREMIUM" must not fall through to a generic
// lease-something bucket).
export interface ClauseTaxonomyEntry {
  clauseType: string;
  headingPattern: RegExp;
}

export const CLAUSE_TAXONOMY: ClauseTaxonomyEntry[] = [
  { clauseType: "LEASE_PREMIUM", headingPattern: /PREMIUM/i },
  { clauseType: "LEASE_DURATION", headingPattern: /DURATION/i },
  { clauseType: "SECURITY_DEPOSIT", headingPattern: /DEPOSIT/i },
  { clauseType: "RENT_PAYMENT", headingPattern: /RENT/i },
  { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i },
  { clauseType: "MAINTENANCE", headingPattern: /MAINTENANCE/i },
  { clauseType: "ENCUMBRANCE_DECLARATION", headingPattern: /ENCUMBRANCE/i },
  { clauseType: "LAND_USE_RESTRICTION", headingPattern: /PERMITTED USE|LAND USE/i },
  { clauseType: "CROP_OR_CULTIVATION_RIGHTS", headingPattern: /CROP|CULTIVATION|HARVEST/i },
  { clauseType: "TERMINATION", headingPattern: /TERMINATION/i },
  { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE/i },
  { clauseType: "JURISDICTION", headingPattern: /JURISDICTION/i },
];

export function classifyHeading(heading: string): string | null {
  const entry = CLAUSE_TAXONOMY.find((e) => e.headingPattern.test(heading));
  return entry?.clauseType ?? null;
}
