import { describe, expect, it } from "vitest";
import {
  buildChunks,
  buildChunksFromClauses,
  buildChunksFromEntities,
} from "../src/rag/chunking.js";

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

  it("tags every clause chunk chunkType: 'clause'", () => {
    const chunks = buildChunksFromClauses("doc-1", clauses);
    expect(chunks.every((c) => c.chunkType === "clause")).toBe(true);
  });
});

// Phase 7A addendum: preamble facts (party names, address, survey number,
// land area, land use type) are never part of any clause, but already
// exist as real, correctly-offset Entity rows - see chunking.ts's header
// comment for the investigation this is based on.
describe("buildChunksFromEntities (Phase 7A addendum: preamble chunking)", () => {
  const clauses = [
    { id: "c1", text: "1. RENT PAYMENT\nRs 30000 per month.", textStart: 500, textEnd: 540 },
  ];
  // A RENT entity that IS inside clause c1's span - must NOT become its
  // own chunk (already covered by the clause chunk - no duplication).
  const rentEntity = { id: "e-rent", label: "RENT", text: "30000", textStart: 515, textEnd: 520 };
  // Preamble entities - all outside any clause span (offsets well before
  // clause c1 starts at 500).
  const landlordEntity = {
    id: "e-landlord",
    label: "LANDLORD",
    text: "Peter Majumdar",
    textStart: 90,
    textEnd: 104,
  };
  const addressEntity = {
    id: "e-address",
    label: "ADDRESS",
    text: "Thane",
    textStart: 60,
    textEnd: 65,
  };

  it("creates one chunk per preamble entity, with genuine (non-fabricated) offsets copied from the entity", () => {
    const chunks = buildChunksFromEntities("doc-1", [landlordEntity, addressEntity], clauses);
    expect(chunks).toHaveLength(2);
    const landlordChunk = chunks.find((c) => c.chunkId === "e-landlord");
    expect(landlordChunk).toMatchObject({
      chunkType: "entity",
      textStart: 90,
      textEnd: 104,
      text: "Landlord: Peter Majumdar",
    });
  });

  it("does NOT create a chunk for an entity already covered by a clause - no duplication", () => {
    const chunks = buildChunksFromEntities("doc-1", [rentEntity, landlordEntity], clauses);
    expect(chunks.map((c) => c.chunkId)).toEqual(["e-landlord"]);
  });

  it("falls back to a humanized label for an entity type with no explicit display name", () => {
    const chunks = buildChunksFromEntities(
      "doc-1",
      [{ id: "e-khata", label: "KHATA_NUMBER", text: "123/A", textStart: 10, textEnd: 15 }],
      clauses,
    );
    expect(chunks[0]?.text).toBe("Khata number: 123/A");
  });

  it("is deterministic - same input in any order produces the same sorted output", () => {
    const first = buildChunksFromEntities("doc-1", [landlordEntity, addressEntity], clauses);
    const second = buildChunksFromEntities("doc-1", [addressEntity, landlordEntity], clauses);
    expect(second).toEqual(first);
    expect(first.map((c) => c.chunkId)).toEqual(["e-address", "e-landlord"]); // sorted by textStart
  });

  it("skips entities with null or empty text", () => {
    const chunks = buildChunksFromEntities(
      "doc-1",
      [{ id: "e-null", label: "ADDRESS", text: null, textStart: 1, textEnd: 1 }],
      clauses,
    );
    expect(chunks).toHaveLength(0);
  });
});

describe("buildChunks (Phase 7A addendum: combined clause + entity chunks)", () => {
  it("combines clause and entity chunks, sorted by document position, with no duplication", () => {
    const clauses = [
      { id: "c1", text: "1. RENT PAYMENT\nRs 30000 per month.", textStart: 500, textEnd: 540 },
    ];
    const entities = [
      { id: "e-rent", label: "RENT", text: "30000", textStart: 515, textEnd: 520 }, // inside c1
      { id: "e-landlord", label: "LANDLORD", text: "Peter Majumdar", textStart: 90, textEnd: 104 }, // preamble
    ];
    const chunks = buildChunks("doc-1", clauses, entities);
    expect(chunks.map((c) => c.chunkId)).toEqual(["e-landlord", "c1"]);
    expect(chunks.map((c) => c.chunkType)).toEqual(["entity", "clause"]);
  });
});
