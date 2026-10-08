import { describe, expect, it } from "vitest";
import { buildDocumentGraph } from "../src/graph/buildGraph.js";
import type { BuildGraphInput } from "../src/graph/types.js";

const base: BuildGraphInput = {
  documentId: "doc-1",
  documentType: "AGREEMENT_TO_SELL",
  modelSource: "RULE_BASED",
  clauses: [],
  entities: [
    { id: "seller", label: "SELLER", text: "Asha Rao", textStart: 10, textEnd: 18 },
    { id: "buyer", label: "BUYER", text: "Vikram Shah", textStart: 30, textEnd: 41 },
    {
      id: "price1",
      label: "SALE_CONSIDERATION",
      text: "Rs. 23,70,000",
      textStart: 100,
      textEnd: 113,
    },
    {
      id: "price2",
      label: "SALE_CONSIDERATION",
      text: "Rs. 33,70,000",
      textStart: 400,
      textEnd: 413,
    },
  ],
  risks: [],
};

describe("buildDocumentGraph (Phase 8 semantic layer)", () => {
  it("is unchanged when no Phase 8 input is given", () => {
    const graph = buildDocumentGraph(base);
    expect(graph.nodes.every((n) => ["DOCUMENT", "ENTITY"].includes(n.type))).toBe(true);
    expect(graph.edges.every((e) => e.type === "HAS_ENTITY")).toBe(true);
  });

  it("adds typed relation, obligation, deadline, contradiction and legal-reference structure", () => {
    const graph = buildDocumentGraph({
      ...base,
      entityCategories: { SELLER: "PARTY", BUYER: "PARTY", SALE_CONSIDERATION: "MONEY" },
      relations: [
        { relationType: "SELLS_TO", subjectEntityId: "seller", objectEntityId: "buyer" },
        { relationType: "HAS_PRICE", subjectEntityId: null, objectEntityId: "price1" },
        // Dangling object - dropped, never a node without evidence.
        { relationType: "HAS_PRICE", subjectEntityId: null, objectEntityId: "missing" },
      ],
      obligations: [
        {
          id: "o1",
          action: "PAY",
          actorEntityId: "buyer",
          amountEntityId: "price1",
          deadline: "within 30 days",
          text: "The Buyer shall pay Rs. 23,70,000 within 30 days.",
          textStart: 90,
          textEnd: 140,
        },
      ],
      risks: [
        {
          id: "r1",
          category: "FINANCIAL_CONTRADICTION",
          pass: "CONSISTENCY",
          evidence: [
            { sourceTable: "entities", sourceId: "price1" },
            { sourceTable: "entities", sourceId: "price2" },
          ],
        },
      ],
      legalReferences: [
        {
          id: "tpa-54",
          title: "Transfer of Property Act, 1882 - s.54",
          verification: "UNVERIFIED",
        },
      ],
    });

    const edge = (type: string) => graph.edges.filter((e) => e.type === type);
    expect(edge("RELATION")).toEqual([
      { type: "RELATION", label: "SELLS_TO", from: "entity:seller", to: "entity:buyer" },
      { type: "RELATION", label: "HAS_PRICE", from: "document:doc-1", to: "entity:price1" },
    ]);
    expect(edge("HAS_OBLIGATION")).toEqual([
      { type: "HAS_OBLIGATION", from: "document:doc-1", to: "obligation:o1" },
    ]);
    expect(edge("MUST_PERFORM")).toEqual([
      { type: "MUST_PERFORM", label: "MUST_PAY", from: "entity:buyer", to: "obligation:o1" },
    ]);
    expect(edge("DUE_ON")).toEqual([{ type: "DUE_ON", from: "obligation:o1", to: "event:o1" }]);
    expect(edge("CONTRADICTS")).toEqual([
      { type: "CONTRADICTS", from: "entity:price1", to: "entity:price2" },
    ]);
    expect(edge("RELEVANT_TO")).toEqual([
      { type: "RELEVANT_TO", from: "legal:tpa-54", to: "document:doc-1" },
    ]);
    // Never an APPLIES_TO claim (docs/legal_reference_policy.md).
    expect(graph.edges.some((e) => (e.type as string) === "APPLIES_TO")).toBe(false);

    const legal = graph.nodes.find((n) => n.type === "LEGAL_REFERENCE")!;
    expect(legal.text).toMatch(/UNVERIFIED/);
    expect(graph.nodes.find((n) => n.id === "entity:buyer")!.category).toBe("PARTY");
    expect(graph.nodes.find((n) => n.id === "obligation:o1")!.textStart).toBe(90);
  });
});
