// Heuristic clause segmentation: Indian legal documents (including every
// document research/generator/generator.py produces) overwhelmingly use
// numbered, capitalized headings ("1. LEASE DURATION", "2. RENT PAYMENT").
// A clause span runs from one heading to the start of the next (or end of
// text) - matching exactly how the synthetic generator itself defines
// clause spans (see BuiltDocument.start_clause/end_clause in generator.py),
// which is what makes this segmentation directly comparable to ground
// truth in Phase 4B evaluation.
//
// This is a real limitation, not just a baseline simplification: a
// document that doesn't use numbered all-caps headings (no headings at
// all, lowercase headings, roman numerals, "Clause 1:" instead of "1.")
// will segment poorly or not at all. See extraction_pipeline.md.

const HEADING_PATTERN = /^(\d{1,2})\.\s+([A-Z][A-Z /&,-]{2,60})\s*$/gm;

export interface ClauseSegment {
  clauseNumber: string;
  heading: string;
  textStart: number;
  textEnd: number;
  text: string;
}

export function segmentClauses(canonicalText: string): ClauseSegment[] {
  const headingMatches = [...canonicalText.matchAll(HEADING_PATTERN)];
  if (headingMatches.length === 0) return [];

  const segments: ClauseSegment[] = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const match = headingMatches[i];
    if (!match || match.index === undefined) continue;
    const next = headingMatches[i + 1];
    const start = match.index;
    const end = next?.index ?? canonicalText.length;
    const clauseNumber = match[1];
    const heading = match[2];
    if (clauseNumber === undefined || heading === undefined) continue;

    segments.push({
      clauseNumber,
      heading: heading.trim(),
      textStart: start,
      textEnd: end,
      text: canonicalText.slice(start, end),
    });
  }
  return segments;
}
