// Rule-based NER pattern registry (Phase 4A baseline 1). Every pattern is
// grounded in the actual surface forms the synthetic generator produces
// (research/generator/value_pools.py) so this baseline is genuinely
// testable against ground truth, not guessed. KHATA_NUMBER and
// EASEMENT_RIGHT are extensions requested beyond what the generator
// produces - real Indian land-record concepts, but UNTESTED against
// synthetic ground truth since no synthetic example contains them (see
// docs/architecture/extraction_pipeline.md).
//
// Each pattern uses the regex `d` (indices) flag so a capture group's
// exact offset - not just the whole match's - can be recovered without
// string-searching for it after the fact.

import type { ExtractedEntityCandidate } from "./types.js";

const MODEL_NAME = "nyayalens-rule-based-v1";

interface StandalonePattern {
  label: string;
  regex: RegExp;
  confidence: number;
  // Which capture group is the entity span (1-based). Omit to use the
  // whole match (group 0).
  group?: number;
}

// --- Amounts (DURATION, LAND_AREA, SURVEY_NUMBER, etc.) -------------------

const STANDALONE_PATTERNS: StandalonePattern[] = [
  {
    label: "DURATION",
    regex: /\b\d{1,3}\s+(?:months?|years?)\b/dg,
    confidence: 0.9,
  },
  {
    label: "SURVEY_NUMBER",
    regex: /\bSurvey\s+No\.?\s*(\d+\/[A-Za-z0-9]+)\b/dg,
    confidence: 0.9,
    group: 1,
  },
  {
    label: "LAND_AREA",
    // The trailing \b must not apply to "sq. ft.": a word boundary after
    // the final "." never exists (both sides are non-word characters), so
    // the regex backtracked to "sq. ft" and missed every ground-truth
    // "sq. ft." span (0/38 on the synthetic set - ~half of LAND_AREA's
    // reported 0.507 F1 in evaluation_results.md).
    regex: /\b\d+(?:\.\d+)?\s+(?:(?:acres?|guntha|hectares?)\b|sq\.\s?ft\.?)/dg,
    confidence: 0.9,
  },
  {
    label: "LAND_USE_TYPE",
    regex: /classified as ([A-Za-z][A-Za-z \-()]*?) land\b/dg,
    confidence: 0.75,
    group: 1,
  },
  // Extension beyond the synthetic generator's ontology - see file header.
  {
    label: "KHATA_NUMBER",
    regex: /\bKhata\s+No\.?\s*([\w/-]+)/dgi,
    confidence: 0.7,
    group: 1,
  },
  {
    label: "EASEMENT_RIGHT",
    regex: /\b(right[s]? of way|easement right[s]?)\b/dgi,
    confidence: 0.55,
  },
  // Party names: "LANDLORD: Name," / "LESSOR: Name," etc.
  {
    label: "LANDLORD",
    regex: /\bLANDLORD:\s*([A-Z][A-Za-z.\s]*?),/dg,
    confidence: 0.85,
    group: 1,
  },
  {
    label: "TENANT",
    regex: /\bTENANT:\s*([A-Z][A-Za-z.\s]*?),/dg,
    confidence: 0.85,
    group: 1,
  },
  {
    label: "LESSOR",
    regex: /\bLESSOR:\s*([A-Z][A-Za-z.\s]*?),/dg,
    confidence: 0.85,
    group: 1,
  },
  {
    // Bug found via Phase 4B evaluation, not this baseline's own tests:
    // the generator's actual text is "LESSEE: Name, hereinafter..."
    // (comma-terminated, same as LESSOR) - this pattern originally
    // required a period, which never matches and silently produced zero
    // LESSEE entities. ruleBasedNer.test.ts never exercised LESSEE/LESSOR/
    // LANDLORD/TENANT directly, which is why this shipped undetected in
    // Phase 4A. See docs/architecture/evaluation_results.md.
    label: "LESSEE",
    regex: /\bLESSEE:\s*([A-Z][A-Za-z.\s]*?),/dg,
    confidence: 0.85,
    group: 1,
  },
  {
    label: "ADDRESS",
    regex: /\b(?:executed at|situated at)\s+([A-Z][A-Za-z]+)/dg,
    confidence: 0.6,
    group: 1,
  },
  {
    label: "NOTICE_PERIOD",
    // Requires "notice" to appear within ~40 chars before the number so a
    // bare "30 days" elsewhere in the document isn't mislabeled.
    regex: /notice[^.]{0,40}?\b(\d{1,3}\s+days?)\b/dgi,
    confidence: 0.75,
    group: 1,
  },
];

// --- Currency amounts: RENT vs SECURITY_DEPOSIT vs LEASE_PREMIUM ---------
// All three share one surface form (₹ + grouped digits), so they can only
// be told apart by the phrase around them - a keyword-window classifier
// rather than three separate regexes that would all match the same text.
//
// Two alternatives, not one: some PDF fonts don't map the ₹ glyph to a
// Unicode code point pdfjs-dist can decode correctly (observed in
// practice - it came through as a stray "n") and other real documents
// may use "Rs." or no symbol at all. Preferring the ₹-prefixed match
// keeps spans identical to the synthetic dataset's ground truth format
// when the symbol survives extraction intact; the bare digit-group
// fallback still finds the amount (just without a currency symbol in the
// span) when it doesn't - degraded, not silently missed.
const AMOUNT_REGEX = /(₹[\d,]+(?:\.\d+)?)|(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?)/dg;
const AMOUNT_CONTEXT_WINDOW = 80;

const AMOUNT_KEYWORDS: Array<{ label: string; keywords: RegExp }> = [
  { label: "SECURITY_DEPOSIT", keywords: /deposit/i },
  { label: "LEASE_PREMIUM", keywords: /premium/i },
  { label: "RENT", keywords: /rent/i },
];

function extractAmountEntities(text: string): ExtractedEntityCandidate[] {
  const results: ExtractedEntityCandidate[] = [];
  for (const match of text.matchAll(AMOUNT_REGEX)) {
    const start = match.index;
    const end = start + match[0].length;
    const windowStart = Math.max(0, start - AMOUNT_CONTEXT_WINDOW);
    const context = text.slice(windowStart, start);

    const hit = AMOUNT_KEYWORDS.find((k) => k.keywords.test(context));
    if (!hit) continue; // don't fabricate a label with no supporting context

    results.push({
      label: hit.label,
      text: match[0],
      textStart: start,
      textEnd: end,
      confidence: 0.8,
      modelName: MODEL_NAME,
    });
  }
  return results;
}

function extractStandaloneEntities(text: string): ExtractedEntityCandidate[] {
  const results: ExtractedEntityCandidate[] = [];
  for (const pattern of STANDALONE_PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const groupIndex = pattern.group ?? 0;
      const indices = (
        match as RegExpMatchArray & { indices?: Array<[number, number] | undefined> }
      ).indices?.[groupIndex];
      const value = groupIndex === 0 ? match[0] : match[groupIndex];
      if (!indices || value === undefined) continue;

      const [start, end] = indices;
      results.push({
        label: pattern.label,
        text: value,
        textStart: start,
        textEnd: end,
        confidence: pattern.confidence,
        modelName: MODEL_NAME,
      });
    }
  }
  return results;
}

// Later matches never override an earlier one at an overlapping span -
// first pattern to claim a span wins (STANDALONE_PATTERNS is ordered
// most-specific-first for that reason).
function dropOverlaps(entities: ExtractedEntityCandidate[]): ExtractedEntityCandidate[] {
  const sorted = [...entities].sort(
    (a, b) => a.textStart - b.textStart || b.confidence - a.confidence,
  );
  const kept: ExtractedEntityCandidate[] = [];
  let lastEnd = -1;
  for (const entity of sorted) {
    if (entity.textStart >= lastEnd) {
      kept.push(entity);
      lastEnd = entity.textEnd;
    }
  }
  return kept;
}

export function runRuleBasedNer(canonicalText: string): ExtractedEntityCandidate[] {
  const entities = [
    ...extractStandaloneEntities(canonicalText),
    ...extractAmountEntities(canonicalText),
  ];
  return dropOverlaps(entities);
}
