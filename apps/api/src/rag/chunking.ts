// Chunking strategy (Phase 7A): one chunk per persisted DocumentClause,
// reusing Phase 4A's existing clause segmentation rather than inventing a
// new scheme - clause boundaries are already deterministic and meaningful
// (see docs/architecture/rag_design.md for the full rationale). A clause
// with no extracted text (shouldn't happen for rule_based, but the type
// is nullable) contributes no chunk.
import type { Chunk } from "./types.js";

export interface ChunkableClause {
  id: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

// Deterministic: same clause rows in any input order always produce the
// same chunk list, sorted by document position - see chunking.test.ts.
export function buildChunksFromClauses(documentId: string, clauses: ChunkableClause[]): Chunk[] {
  return clauses
    .filter((c): c is ChunkableClause & { text: string } => c.text !== null && c.text.length > 0)
    .map((c) => ({
      chunkId: c.id,
      documentId,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
    }))
    .sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));
}
