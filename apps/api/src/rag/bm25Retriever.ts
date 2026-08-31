// BM25 lexical retrieval - the default RetrievalProvider (see
// rag_design.md for why: no embedding inference needed, so it's
// guaranteed runnable given this project's documented CPU-only compute
// constraints - Phase 4B - and pgvector isn't installed in this
// environment's Postgres either). Hand-rolled rather than a dependency:
// BM25 is a small, well-specified formula and this keeps the retrieval
// path free of an extra package for something this size.
import { tokenize } from "./textUtils.js";
import type { Chunk, RetrievalProvider, ScoredChunk } from "./types.js";

const K1 = 1.5;
const B = 0.75;

export const BM25Retriever: RetrievalProvider = {
  name: "bm25",
  retrieve(query: string, chunks: Chunk[], k: number): ScoredChunk[] {
    const docTokens = chunks.map((c) => tokenize(c.text));
    const n = chunks.length;
    const avgDocLength = n > 0 ? docTokens.reduce((sum, t) => sum + t.length, 0) / n : 0;

    const documentFrequency = new Map<string, number>();
    for (const tokens of docTokens) {
      for (const term of new Set(tokens)) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
    }

    const queryTerms = Array.from(new Set(tokenize(query)));

    const scored: ScoredChunk[] = chunks.map((chunk, i) => {
      const tokens = docTokens[i] ?? [];
      const termFrequency = new Map<string, number>();
      for (const term of tokens) {
        termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
      }

      let score = 0;
      for (const term of queryTerms) {
        const df = documentFrequency.get(term) ?? 0;
        if (df === 0) continue;
        const tf = termFrequency.get(term) ?? 0;
        if (tf === 0) continue;
        const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
        const normalizedLength = avgDocLength > 0 ? tokens.length / avgDocLength : 1;
        const denominator = tf + K1 * (1 - B + B * normalizedLength);
        score += idf * ((tf * (K1 + 1)) / (denominator || 1));
      }
      return { chunk, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  },
};
