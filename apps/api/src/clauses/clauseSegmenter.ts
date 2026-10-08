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

const HEADING_PATTERN = /^(\d{1,2})\.\s+([A-Z][A-Z /&,'-]{2,60})\s*$/gm;

// Phase 8: the other heading conventions real (and v2/v3 synthetic)
// documents use. Each is anchored to a whole line (or, for the inline
// style, a line start followed by a colon) so body text can't match.
// None of these matches any v1 heading, and the original pattern above is
// unchanged apart from also allowing an apostrophe ("LESSOR'S COVENANTS") -
// v1/adversarial segmentation parity is re-verified in
// docs/domain_packs.md.
const TITLE_WORDS = String.raw`[A-Z][A-Za-z'-]*(?:[ -](?:[A-Z][A-Za-z'-]*|and|of|the|for|to|in|on|by|or))*`;
const EXTRA_HEADING_PATTERNS: Array<{ regex: RegExp; roman?: boolean; numbered: boolean }> = [
  // "1) RENT PAYMENT"
  { regex: /^(\d{1,2})\)\s+([A-Z][A-Z /&,'-]{2,60})\s*$/gm, numbered: true },
  // "Clause 3: Security Deposit"
  {
    regex: new RegExp(String.raw`^Clause\s+(\d{1,2}):\s+(${TITLE_WORDS})\s*$`, "gm"),
    numbered: true,
  },
  // "ARTICLE IV - POSSESSION"
  {
    regex: /^ARTICLE\s+([IVXL]{1,6})\s+-\s+([A-Z][A-Z /&,'-]{2,60})\s*$/gm,
    roman: true,
    numbered: true,
  },
  // "4. Security Deposit" (title case on its own line)
  { regex: new RegExp(String.raw`^(\d{1,2})\.\s+(${TITLE_WORDS})\s*$`, "gm"), numbered: true },
  // "4. Security Deposit: The Tenant shall ..." (inline heading)
  { regex: new RegExp(String.raw`^(\d{1,2})\.\s+(${TITLE_WORDS}):\s`, "gm"), numbered: true },
  // Unnumbered sections: "SCHEDULE OF THE PROPERTY", "ANNEXURE A - ...", "RECEIPT"
  {
    regex: /^((?:SCHEDULE|ANNEXURE)[A-Z0-9 /&,'-]{0,70}|(?:RENT\s+)?RECEIPT)\s*$/gm,
    numbered: false,
  },
];

function romanToArabic(roman: string): string {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = values[roman[i]!] ?? 0;
    const next = values[roman[i + 1] ?? ""] ?? 0;
    total += v < next ? -v : v;
  }
  return String(total);
}

export interface ClauseSegment {
  /** Null for unnumbered sections (schedules, annexures). */
  clauseNumber: string | null;
  heading: string;
  textStart: number;
  textEnd: number;
  text: string;
}

interface HeadingMatch {
  index: number;
  clauseNumber: string | null;
  heading: string;
}

function findHeadings(text: string): HeadingMatch[] {
  const found = new Map<number, HeadingMatch>();
  for (const match of text.matchAll(HEADING_PATTERN)) {
    if (match.index !== undefined && match[1] && match[2]) {
      found.set(match.index, { index: match.index, clauseNumber: match[1], heading: match[2] });
    }
  }
  for (const { regex, roman, numbered } of EXTRA_HEADING_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined || found.has(match.index)) continue;
      const heading = numbered ? match[2] : match[1];
      if (!heading) continue;
      const clauseNumber = numbered ? (roman ? romanToArabic(match[1]!) : match[1]!) : null;
      found.set(match.index, { index: match.index, clauseNumber, heading });
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

export function segmentClauses(canonicalText: string): ClauseSegment[] {
  const headings = findHeadings(canonicalText);
  return headings.map((h, i) => {
    const end = headings[i + 1]?.index ?? canonicalText.length;
    return {
      clauseNumber: h.clauseNumber,
      heading: h.heading.trim(),
      textStart: h.index,
      textEnd: end,
      text: canonicalText.slice(h.index, end),
    };
  });
}
