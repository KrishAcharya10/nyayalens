import { describe, expect, it } from "vitest";
import { buildChunksFromClauses } from "../src/rag/chunking.js";

describe("buildChunksFromClauses (Phase 7A chunking)", () => {
  const clauses = [
    { id: "c2", text: "2. RENT PAYMENT\nRs 30000 per month.", textStart: 40, textEnd: 76 },
    { id: "c1", text: "1. LEASE DURATION\n12 months.", textStart: 0, textEnd: 40 },
    { id: "c3", text: "3. TERMINATION\nEither party may terminate.", textStart: 76, textEnd: 120 },
  ];

  it("produces one chunk per clause, sorted by document position regardless of input order", () => {
    const chunks = buildChunksFromClauses("doc-1", clauses);
    expect(chunks.map((c) => c.chunkId)).toEqual(["c1", "c2", "c3"]);
    expect(chunks.every((c) => c.documentId === "doc-1")).toBe(true);
  });

  it("is deterministic - the same input always produces the same output", () => {
    const first = buildChunksFromClauses("doc-1", clauses);
    const second = buildChunksFromClauses("doc-1", clauses);
    expect(second).toEqual(first);

    // Even with the input array's own order shuffled, the result is identical.
    const shuffled = [clauses[2], clauses[0], clauses[1]].filter((c) => c !== undefined);
    const third = buildChunksFromClauses("doc-1", shuffled);
    expect(third).toEqual(first);
  });

  it("skips clauses with null or empty text", () => {
    const withEmpty = [
      ...clauses,
      { id: "c4", text: null, textStart: 120, textEnd: 120 },
      { id: "c5", text: "", textStart: 120, textEnd: 120 },
    ];
    const chunks = buildChunksFromClauses("doc-1", withEmpty);
    expect(chunks.map((c) => c.chunkId)).toEqual(["c1", "c2", "c3"]);
  });
});
