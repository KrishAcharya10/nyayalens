import { BM25Retriever } from "./bm25Retriever.js";
import type { RetrievalProvider } from "./types.js";

// BM25 is the only real (non-test-double) RetrievalProvider implemented
// this phase - see rag_design.md for why (pgvector unavailable in this
// environment's Postgres; BM25 needs no embedding inference at all, so
// it's unaffected by the project's documented CPU-only constraints).
// Still a factory function, not a direct import at call sites, so a
// future VectorRetriever is a one-line swap here.
export function getActiveRetrievalProvider(): RetrievalProvider {
  return BM25Retriever;
}
