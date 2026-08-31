import { describe, expect, it } from "vitest";
import { BM25Retriever } from "../src/rag/bm25Retriever.js";
import type { Chunk, RetrievalProvider, ScoredChunk } from "../src/rag/types.js";

// A trivial second RetrievalProvider implementation - a test double, not a
// production retriever - that scores every chunk purely by its length.
// Exists solely to prove the calling code depends only on the
// RetrievalProvider interface, not on BM25Retriever specifically.
const ReverseLengthStubRetriever: RetrievalProvider = {
  name: "reverse-length-stub",
  retrieve(_query: string, chunks: Chunk[], k: number): ScoredChunk[] {
    return [...chunks]
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, k)
      .map((chunk) => ({ chunk, score: chunk.text.length }));
  },
};

function runRetrieval(provider: RetrievalProvider, query: string, chunks: Chunk[], k: number) {
  // Calling code that only knows about the RetrievalProvider interface -
  // this is exactly what runAsk.ts does with whichever provider the
  // factory hands it.
  return provider.retrieve(query, chunks, k);
}

describe("RetrievalProvider swappability (Phase 7A)", () => {
  const chunks: Chunk[] = [
    {
      chunkId: "c1",
      documentId: "doc-1",
      text: "The security deposit is refundable.",
      textStart: 0,
      textEnd: 36,
    },
    {
      chunkId: "c2",
      documentId: "doc-1",
      text: "Rent is due on the 5th of each month.",
      textStart: 36,
      textEnd: 74,
    },
    {
      chunkId: "c3",
      documentId: "doc-1",
      text: "This Agreement shall be governed by the laws of India, and courts shall have exclusive jurisdiction.",
      textStart: 74,
      textEnd: 178,
    },
  ];

  it("runs the same call against BM25Retriever and a stub second implementation via one interface, with no calling-code change", () => {
    const bm25Result = runRetrieval(BM25Retriever, "security deposit", chunks, 1);
    const stubResult = runRetrieval(ReverseLengthStubRetriever, "security deposit", chunks, 1);

    expect(bm25Result).toHaveLength(1);
    expect(bm25Result[0]?.chunk.chunkId).toBe("c1"); // relevant to the query

    expect(stubResult).toHaveLength(1);
    expect(stubResult[0]?.chunk.chunkId).toBe("c3"); // longest chunk, regardless of query - proves it's a different algorithm
  });

  it("BM25Retriever ranks the lexically matching chunk above unrelated chunks", () => {
    const results = BM25Retriever.retrieve("when is rent due", chunks, 3);
    expect(results[0]?.chunk.chunkId).toBe("c2");
  });

  it("BM25Retriever returns nothing above zero score when no query term appears anywhere", () => {
    const results = BM25Retriever.retrieve("xyzzyplugh", chunks, 3).filter((r) => r.score > 0);
    expect(results).toHaveLength(0);
  });
});
