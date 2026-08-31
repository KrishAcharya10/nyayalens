import { describe, expect, it } from "vitest";
import { buildSegments, groupSegmentsByClause } from "./spans";

interface Clause {
  id: string;
  textStart: number | null;
  textEnd: number | null;
}
interface Entity {
  id: string;
  textStart: number | null;
  textEnd: number | null;
}

describe("buildSegments (Phase 7B document-viewer span overlap)", () => {
  it("partitions the entire text with no gaps and no overlaps - every character in exactly one segment", () => {
    const text = "0123456789";
    const clauses: Clause[] = [{ id: "c1", textStart: 2, textEnd: 8 }];
    const entities: Entity[] = [{ id: "e1", textStart: 4, textEnd: 6 }];

    const segments = buildSegments(text, clauses, entities);

    // Segments cover [0,10) contiguously with no gap or overlap.
    expect(segments[0]?.start).toBe(0);
    expect(segments[segments.length - 1]?.end).toBe(10);
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i]?.end).toBe(segments[i + 1]?.start);
    }
    // Reassembling every segment's text reproduces the original exactly -
    // proves no duplication and no dropped characters.
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("puts an entity fully inside a clause into a segment carrying both", () => {
    const text = "AAAABBBBCCCC"; // clause covers BBBB (4-8), entity covers BB (5-7)
    const clauses: Clause[] = [{ id: "c1", textStart: 4, textEnd: 8 }];
    const entities: Entity[] = [{ id: "e1", textStart: 5, textEnd: 7 }];

    const segments = buildSegments(text, clauses, entities);
    const entitySegment = segments.find((s) => s.text === "BB" && s.start === 5);
    expect(entitySegment?.clause?.id).toBe("c1");
    expect(entitySegment?.entities.map((e) => e.id)).toEqual(["e1"]);

    // The rest of the clause (outside the entity) still carries the
    // clause but no entity.
    const clauseOnlySegment = segments.find((s) => s.start === 4 && s.end === 5);
    expect(clauseOnlySegment?.clause?.id).toBe("c1");
    expect(clauseOnlySegment?.entities).toEqual([]);
  });

  it("gives a preamble entity (outside every clause) a segment with clause: null", () => {
    const text = "PREAMBLE-TEXT-1. HEADING-CLAUSE-TEXT";
    const clauses: Clause[] = [{ id: "c1", textStart: 16, textEnd: text.length }];
    const entities: Entity[] = [{ id: "e-landlord", textStart: 0, textEnd: 8 }];

    const segments = buildSegments(text, clauses, entities);
    const preambleSegment = segments.find((s) => s.entities.some((e) => e.id === "e-landlord"));
    expect(preambleSegment?.clause).toBeNull();
  });

  it("handles multiple entities covering the same segment (defensive - entities are not assumed non-overlapping)", () => {
    const text = "0123456789";
    const clauses: Clause[] = [];
    const entities: Entity[] = [
      { id: "e1", textStart: 2, textEnd: 6 },
      { id: "e2", textStart: 3, textEnd: 5 },
    ];
    const segments = buildSegments(text, clauses, entities);
    const overlapSegment = segments.find((s) => s.start === 3 && s.end === 5);
    expect(overlapSegment?.entities.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("ignores clauses/entities with null or invalid (start >= end) offsets rather than crashing", () => {
    const text = "0123456789";
    const clauses: Clause[] = [{ id: "c1", textStart: null, textEnd: null }];
    const entities: Entity[] = [{ id: "e1", textStart: 5, textEnd: 5 }];
    const segments = buildSegments(text, clauses, entities);
    expect(segments.every((s) => s.clause === null && s.entities.length === 0)).toBe(true);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("produces a single whole-text segment when there are no clauses or entities at all", () => {
    const text = "no structure here";
    const segments = buildSegments(text, [] as Clause[], [] as Entity[]);
    expect(segments).toEqual([{ start: 0, end: text.length, text, clause: null, entities: [] }]);
  });

  it("handles empty text without crashing", () => {
    const segments = buildSegments("", [] as Clause[], [] as Entity[]);
    expect(segments).toEqual([]);
  });
});

describe("groupSegmentsByClause", () => {
  it("groups consecutive same-clause segments into one block, and separates preamble/gap text into its own null-clause block", () => {
    const text = "PREAMBLE 1. HEADING BODY-TEXT 2. HEADING BODY-TEXT-2";
    const clauses: Clause[] = [
      { id: "c1", textStart: 9, textEnd: 30 },
      { id: "c2", textStart: 30, textEnd: text.length },
    ];
    const segments = buildSegments(text, clauses, [] as Entity[]);
    const blocks = groupSegmentsByClause(segments);

    expect(blocks.map((b) => b.clause?.id ?? null)).toEqual([null, "c1", "c2"]);
    // Reassembling every block's segments' text still reproduces the
    // original text exactly.
    const reassembled = blocks.flatMap((b) => b.segments.map((s) => s.text)).join("");
    expect(reassembled).toBe(text);
  });

  it("does not merge two different null-clause blocks that are separated by a clause (no false merge across a gap)", () => {
    const text = "AAA 1. H BBB";
    const clauses: Clause[] = [{ id: "c1", textStart: 4, textEnd: 8 }];
    const segments = buildSegments(text, clauses, [] as Entity[]);
    const blocks = groupSegmentsByClause(segments);
    expect(blocks.map((b) => b.clause?.id ?? null)).toEqual([null, "c1", null]);
  });
});
