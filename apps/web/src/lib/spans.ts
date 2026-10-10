// Span-overlap resolution for the document viewer (Phase 7B, Section 11).
// Clauses and entities both carry [textStart, textEnd) offsets into the
// same canonical_text (see docs/architecture/provenance.md) and entities
// routinely sit *inside* a clause's span. Rendering both naively as
// separate <span> wrappers would produce overlapping/duplicated DOM.
//
// This module partitions the ENTIRE text into a flat, ordered list of
// non-overlapping segments - every character of the source text appears
// in exactly one segment - each segment annotated with which clause (at
// most one; clauses never overlap each other, see clauseSegmenter.ts) and
// which entities cover it. The renderer then nests clause (outer) and
// entity (inner) wrappers per segment without ever re-slicing or
// duplicating text.
export interface SpanLike {
  id: string;
  textStart: number | null;
  textEnd: number | null;
}

export interface TextSegment<TClause extends SpanLike, TEntity extends SpanLike> {
  start: number;
  end: number;
  text: string;
  clause: TClause | null;
  entities: TEntity[];
}

function hasValidSpan<T extends SpanLike>(s: T): s is T & { textStart: number; textEnd: number } {
  return s.textStart !== null && s.textEnd !== null && s.textStart < s.textEnd;
}

export function buildSegments<TClause extends SpanLike, TEntity extends SpanLike>(
  text: string,
  clauses: TClause[],
  entities: TEntity[],
): TextSegment<TClause, TEntity>[] {
  const validClauses = clauses.filter(hasValidSpan);
  const validEntities = entities.filter(hasValidSpan);

  const boundarySet = new Set<number>([0, text.length]);
  for (const c of validClauses) {
    boundarySet.add(Math.max(0, Math.min(c.textStart, text.length)));
    boundarySet.add(Math.max(0, Math.min(c.textEnd, text.length)));
  }
  for (const e of validEntities) {
    boundarySet.add(Math.max(0, Math.min(e.textStart, text.length)));
    boundarySet.add(Math.max(0, Math.min(e.textEnd, text.length)));
  }
  const boundaries = [...boundarySet].sort((a, b) => a - b);

  const segments: TextSegment<TClause, TEntity>[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (start === undefined || end === undefined || start >= end) continue;

    const clause = validClauses.find((c) => c.textStart <= start && c.textEnd >= end) ?? null;
    const coveringEntities = validEntities.filter((e) => e.textStart <= start && e.textEnd >= end);

    segments.push({ start, end, text: text.slice(start, end), clause, entities: coveringEntities });
  }
  return segments;
}

export interface ClauseBlock<TClause extends SpanLike, TEntity extends SpanLike> {
  clause: TClause | null;
  segments: TextSegment<TClause, TEntity>[];
}

// Groups consecutive segments sharing the same clause (or no clause) into
// blocks, so the viewer can render one block-level wrapper per clause
// (a left border / subtle background spanning the whole clause, including
// line wraps) instead of trying to fake a block boundary out of inline
// spans. Clauses never interleave with each other (clauseSegmenter.ts
// produces non-overlapping spans), so this grouping is unambiguous.
export function groupSegmentsByClause<TClause extends SpanLike, TEntity extends SpanLike>(
  segments: TextSegment<TClause, TEntity>[],
): ClauseBlock<TClause, TEntity>[] {
  const blocks: ClauseBlock<TClause, TEntity>[] = [];
  for (const segment of segments) {
    const last = blocks[blocks.length - 1];
    const lastKey = last?.clause?.id ?? null;
    const segmentKey = segment.clause?.id ?? null;
    if (last && lastKey === segmentKey) {
      last.segments.push(segment);
    } else {
      blocks.push({ clause: segment.clause, segments: [segment] });
    }
  }
  return blocks;
}

// Display-only reflow for text extracted from PDFs, which arrives with hard
// line wraps mid-sentence ("residing at / House No. 982, Road / No. 9"). A
// wrap newline is replaced by a space - one character for one character, so
// every offset into the text (clauses, entities, evidence) is unchanged.
// A newline is kept when:
//   - it is part of a blank line (paragraph break);
//   - the line ends a sentence or bracket: . : ; ! ? ) " or a closing quote;
//   - the line is all capitals (a title or heading);
//   - the next line starts a numbered heading ("2. RENT", "3) TERM") or a
//     capitalised heading word ("AND", "SCHEDULE").
export function reflowForDisplay(text: string): string {
  const lines = text.split("\n");
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out += line;
    if (i === lines.length - 1) break;
    const next = lines[i + 1]!;
    const trimmed = line.trimEnd();
    const keep =
      trimmed === "" ||
      next.trim() === "" ||
      /[.:;!?)"”]$/.test(trimmed) ||
      (/[A-Za-z]/.test(trimmed) && trimmed === trimmed.toUpperCase()) ||
      /^\s*(?:\d+[.)]|[A-Z]{2,}\b)/.test(next);
    out += keep ? "\n" : " ";
  }
  return out;
}
