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
import type { ClauseTypeDescriptor } from "../domains/registry.js";

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

// Document-scoped classification (Phase 8): a DomainPack's clauseSchema,
// ordered by its explicit priority (lowest first) instead of array
// position. CLAUSE_TAXONOMY above stays the default - the union of the
// original two domains - for callers that pass no taxonomy.
export function taxonomyFromSchema(
  clauseSchema: readonly ClauseTypeDescriptor[],
): ClauseTaxonomyEntry[] {
  return [...clauseSchema]
    .sort((a, b) => a.priority - b.priority)
    .map(({ clauseType, headingPattern }) => ({ clauseType, headingPattern }));
}

export function classifyHeading(
  heading: string,
  taxonomy: readonly ClauseTaxonomyEntry[] = CLAUSE_TAXONOMY,
): string | null {
  const entry = taxonomy.find((e) => e.headingPattern.test(heading));
  return entry?.clauseType ?? null;
}

export function headingPatternsByType(
  clauseSchema: readonly ClauseTypeDescriptor[],
): Record<string, RegExp[]> {
  const out: Record<string, RegExp[]> = {};
  for (const c of clauseSchema) (out[c.clauseType] ??= []).push(c.headingPattern);
  return out;
}

// Wording that shows a clause type is present even when its heading is not
// one the heading patterns know ("Courts", "Obligations", "Payments"). Used
// ONLY to avoid reporting an expected clause as missing - never to label a
// clause - so a heading that is unusual cannot by itself produce an absence
// finding. Each cue is deliberately specific to one clause type.
export const BODY_CUES: Record<string, RegExp> = {
  JURISDICTION:
    /\bexclusive jurisdiction\b|\bcourts? (?:at|of|in)\b[^.]{0,80}\bjurisdiction\b|\bjurisdiction of the courts?\b|\bsubject to the jurisdiction\b/i,
  CONFIDENTIALITY:
    /\b(?:shall|must|will) keep\b[^.]{0,80}\b(?:confidential|secret)\b|\bnot disclose\b[^.]{0,80}\b(?:confidential|third part)/i,
  DEFINITIONS: /["“][^"”]{3,60}["”]\s+means\b/i,
  EXCLUSIONS:
    /\b(?:do(?:es)? not (?:apply|cover)|exclud(?:es|ed|ing))\b[^.]{0,120}\b(?:public|already known|independently developed)\b/i,
  POSITION:
    /\b(?:appointed as|offer you the position|position of|designation|employs the employee as)\b/i,
  COMMENCEMENT:
    /\b(?:joining date|shall join on|will join on|date of joining|commence(?:s|ment)? (?:on|from))\b/i,
  COMPENSATION:
    /\b(?:CTC|cost to (?:the )?company|gross (?:monthly )?salary|annual remuneration|remuneration)\b/i,
  ADVANCE: /\badvance (?:of|amount|payment)\b|\bpaid an advance\b|\bas (?:an )?advance\b/i,
  TERMINATION:
    /\b(?:either party|the (?:landlord|tenant|licensor|licensee|lessor|lessee|employer|employee|client|customer|supplier|company))\b[^.]{0,40}\b(?:may|can)\s+(?:terminate|end)\b/i,
  BALANCE_PAYMENT: /\bbalance (?:of|amount|payment|consideration)\b/i,
  ENCUMBRANCE: /\bfree from\b[^.]{0,80}\b(?:mortgage|lien|charge|litigation|encumbrance)/i,
};
