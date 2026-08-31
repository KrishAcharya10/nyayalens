import { describe, expect, it } from "vitest";
import { buildDocumentGraph } from "../src/graph/buildGraph.js";
import type { BuildGraphInput } from "../src/graph/types.js";

describe("buildDocumentGraph (Phase 7A)", () => {
  it("builds DOCUMENT/CLAUSE/ENTITY/RISK_FINDING nodes and HAS_CLAUSE/HAS_ENTITY/REFERENCES/FLAGS edges exactly matching the input", () => {
    const input: BuildGraphInput = {
      documentId: "doc-1",
      documentType: "RESIDENTIAL_RENTAL",
      modelSource: "RULE_BASED",
      clauses: [
        {
          id: "c1",
          clauseType: "SECURITY_DEPOSIT",
          text: "3. SECURITY DEPOSIT\nThe Tenant shall pay a deposit of Rs 150000.",
          textStart: 0,
          textEnd: 60,
        },
      ],
      entities: [
        { id: "e1", label: "SECURITY_DEPOSIT", text: "150000", textStart: 50, textEnd: 56 },
        // Outside every clause span - must get HAS_ENTITY but no REFERENCES edge.
        { id: "e2", label: "ADDRESS", text: "Thane", textStart: 500, textEnd: 505 },
      ],
      risks: [
        {
          id: "r1",
          category: "UNBOUNDED_DISCRETION",
          evidence: [{ sourceTable: "document_clauses", sourceId: "c1" }],
        },
      ],
    };

    const graph = buildDocumentGraph(input);

    expect(graph.documentId).toBe("doc-1");
    expect(graph.modelSource).toBe("RULE_BASED");

    const nodeIds = graph.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(
      ["document:doc-1", "clause:c1", "entity:e1", "entity:e2", "risk:r1"].sort(),
    );

    const documentNode = graph.nodes.find((n) => n.id === "document:doc-1");
    expect(documentNode?.type).toBe("DOCUMENT");
    expect(documentNode?.label).toBe("RESIDENTIAL_RENTAL");

    const clauseNode = graph.nodes.find((n) => n.id === "clause:c1");
    expect(clauseNode?.type).toBe("CLAUSE");
    expect(clauseNode?.label).toBe("SECURITY_DEPOSIT");

    const riskNode = graph.nodes.find((n) => n.id === "risk:r1");
    expect(riskNode?.type).toBe("RISK_FINDING");
    expect(riskNode?.label).toBe("UNBOUNDED_DISCRETION");

    expect(graph.edges).toContainEqual({
      type: "HAS_CLAUSE",
      from: "document:doc-1",
      to: "clause:c1",
    });
    expect(graph.edges).toContainEqual({
      type: "HAS_ENTITY",
      from: "document:doc-1",
      to: "entity:e1",
    });
    expect(graph.edges).toContainEqual({
      type: "HAS_ENTITY",
      from: "document:doc-1",
      to: "entity:e2",
    });
    // e1 (50-56) is within c1's span (0-60) - REFERENCES fires.
    expect(graph.edges).toContainEqual({ type: "REFERENCES", from: "clause:c1", to: "entity:e1" });
    // e2 (500-505) is not within any clause span - REFERENCES must not fire for it.
    expect(graph.edges.some((e) => e.type === "REFERENCES" && e.to === "entity:e2")).toBe(false);
    expect(graph.edges).toContainEqual({ type: "FLAGS", from: "risk:r1", to: "clause:c1" });
  });

  it("adds a COMPARED_WITH edge between both clauses a Pass 2 finding's evidence cites, and none for a single-clause Pass 1-style finding", () => {
    const input: BuildGraphInput = {
      documentId: "doc-2",
      documentType: "RESIDENTIAL_RENTAL",
      modelSource: "RULE_BASED",
      clauses: [
        {
          id: "c1",
          clauseType: "NOTICE_PERIOD",
          text: "landlord notice",
          textStart: 0,
          textEnd: 20,
        },
        {
          id: "c2",
          clauseType: "NOTICE_PERIOD",
          text: "tenant notice",
          textStart: 20,
          textEnd: 40,
        },
        {
          id: "c3",
          clauseType: "SECURITY_DEPOSIT",
          text: "deposit clause",
          textStart: 40,
          textEnd: 60,
        },
      ],
      entities: [],
      risks: [
        {
          id: "r-asymmetric",
          category: "ASYMMETRIC_OBLIGATION",
          evidence: [
            { sourceTable: "document_clauses", sourceId: "c1" },
            { sourceTable: "document_clauses", sourceId: "c2" },
          ],
        },
        {
          id: "r-discretion",
          category: "UNBOUNDED_DISCRETION",
          evidence: [{ sourceTable: "document_clauses", sourceId: "c3" }],
        },
      ],
    };

    const graph = buildDocumentGraph(input);
    const comparedEdges = graph.edges.filter((e) => e.type === "COMPARED_WITH");
    expect(comparedEdges).toHaveLength(1);
    expect(comparedEdges[0]).toEqual({ type: "COMPARED_WITH", from: "clause:c1", to: "clause:c2" });
  });

  it("adds a FLAGS edge to an entity node for evidence sourced from entities, e.g. LAND_USE_CONTRADICTION", () => {
    const input: BuildGraphInput = {
      documentId: "doc-3",
      documentType: "LAND_LEASE",
      modelSource: "RULE_BASED",
      clauses: [
        {
          id: "c1",
          clauseType: "LAND_USE_RESTRICTION",
          text: "construction of a warehouse",
          textStart: 0,
          textEnd: 30,
        },
      ],
      entities: [
        { id: "e1", label: "LAND_USE_TYPE", text: "Agricultural", textStart: 100, textEnd: 112 },
      ],
      risks: [
        {
          id: "r1",
          category: "LAND_USE_CONTRADICTION",
          evidence: [
            { sourceTable: "entities", sourceId: "e1" },
            { sourceTable: "document_clauses", sourceId: "c1" },
          ],
        },
      ],
    };

    const graph = buildDocumentGraph(input);
    expect(graph.edges).toContainEqual({ type: "FLAGS", from: "risk:r1", to: "entity:e1" });
    expect(graph.edges).toContainEqual({ type: "FLAGS", from: "risk:r1", to: "clause:c1" });
    // Mixed entity+clause evidence - COMPARED_WITH is clause-clause only,
    // so exactly zero here (only one clause-sourced span).
    expect(graph.edges.filter((e) => e.type === "COMPARED_WITH")).toHaveLength(0);
  });

  it("ignores evidence referencing a clause/entity id not present in this document's own clause/entity set", () => {
    const input: BuildGraphInput = {
      documentId: "doc-4",
      documentType: "RESIDENTIAL_RENTAL",
      modelSource: "RULE_BASED",
      clauses: [],
      entities: [],
      risks: [
        {
          id: "r1",
          category: "MISSING_CLAUSE",
          evidence: [{ sourceTable: "document_clauses", sourceId: "nonexistent" }],
        },
      ],
    };
    const graph = buildDocumentGraph(input);
    expect(graph.edges.filter((e) => e.type === "FLAGS")).toHaveLength(0);
    expect(graph.nodes.some((n) => n.id === "risk:r1")).toBe(true);
  });
});
