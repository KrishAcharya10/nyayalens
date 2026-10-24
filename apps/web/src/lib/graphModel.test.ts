import { describe, expect, it } from "vitest";
import type { DocumentGraph, GraphEdge, GraphNode, GraphNodeType } from "./apiTypes";
import { buildView, evidenceTarget, neighboursOf, rawId, sanitizeGraph } from "./graphModel";

const node = (id: string, type: GraphNodeType, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type,
  label: id,
  text: null,
  textStart: null,
  textEnd: null,
  ...extra,
});
const edge = (type: GraphEdge["type"], from: string, to: string, label?: string): GraphEdge => ({
  type,
  from,
  to,
  ...(label ? { label } : {}),
});

const GRAPH: DocumentGraph = {
  documentId: "d",
  modelSource: "RULE_BASED",
  nodes: [
    node("document:d", "DOCUMENT"),
    node("clause:c1", "CLAUSE"),
    node("entity:buyer", "ENTITY"),
    node("entity:price", "ENTITY"),
    node("entity:lonely", "ENTITY"),
    node("obligation:o1", "OBLIGATION"),
    node("risk:r1", "RISK_FINDING"),
  ],
  edges: [
    edge("HAS_CLAUSE", "document:d", "clause:c1"),
    edge("HAS_ENTITY", "document:d", "entity:buyer"),
    edge("HAS_ENTITY", "document:d", "entity:price"),
    edge("HAS_ENTITY", "document:d", "entity:lonely"),
    edge("HAS_OBLIGATION", "document:d", "obligation:o1"),
    edge("REFERENCES", "clause:c1", "entity:price"),
    edge("MUST_PERFORM", "entity:buyer", "obligation:o1", "MUST_PAY"),
    edge("REFERENCES", "obligation:o1", "entity:price"),
    edge("FLAGS", "risk:r1", "entity:price"),
  ],
};

describe("sanitizeGraph", () => {
  it("returns an empty graph for null, undefined and a body with no arrays", () => {
    for (const raw of [null, undefined, {} as DocumentGraph, { nodes: "x", edges: 3 } as never]) {
      const g = sanitizeGraph(raw);
      expect(g.nodes).toEqual([]);
      expect(g.edges).toEqual([]);
    }
  });

  it("keeps a valid graph unchanged", () => {
    const g = sanitizeGraph(GRAPH);
    expect(g.nodes).toHaveLength(GRAPH.nodes.length);
    expect(g.edges).toHaveLength(GRAPH.edges.length);
    expect(g.dropped).toEqual({ nodes: 0, edges: 0 });
  });

  it("drops nodes with no id, an unknown type, or a duplicate id (first wins) and counts them", () => {
    const g = sanitizeGraph({
      ...GRAPH,
      nodes: [
        node("a", "ENTITY", { label: "first" }),
        node("a", "ENTITY", { label: "second" }),
        { ...node("b", "ENTITY"), type: "SPACESHIP" as GraphNodeType },
        { ...node("c", "ENTITY"), id: "" },
        null as unknown as GraphNode,
      ],
      edges: [],
    });
    expect(g.nodes.map((n) => n.label)).toEqual(["first"]);
    expect(g.dropped.nodes).toBe(4);
  });

  it("drops dangling, self-referencing and repeated edges", () => {
    const g = sanitizeGraph({
      ...GRAPH,
      nodes: [node("a", "ENTITY"), node("b", "ENTITY")],
      edges: [
        edge("RELATION", "a", "b", "X"),
        edge("RELATION", "a", "b", "X"), // repeat
        edge("RELATION", "a", "ghost"), // dangling
        edge("RELATION", "ghost", "b"), // dangling
        edge("RELATION", "a", "a"), // self
        { type: "RELATION", from: "a" } as GraphEdge, // malformed
      ],
    });
    expect(g.edges).toHaveLength(1);
    expect(g.dropped.edges).toBe(5);
  });

  it("turns non-numeric offsets into null instead of passing them on", () => {
    const g = sanitizeGraph({
      ...GRAPH,
      nodes: [node("a", "ENTITY", { textStart: "7" as unknown as number, textEnd: NaN })],
      edges: [],
    });
    expect(g.nodes[0]!.textStart).toBeNull();
    expect(g.nodes[0]!.textEnd).toBeNull();
  });
});

describe("buildView", () => {
  const clean = sanitizeGraph(GRAPH);
  const base = { hidden: new Set<GraphNodeType>(), showStructure: false, keyFactsOnly: false };

  it("hides the document node and the 'belongs to the document' edges by default", () => {
    const v = buildView(clean, base);
    expect(v.nodes.some((n) => n.type === "DOCUMENT")).toBe(false);
    expect(v.edges.some((e) => e.type.startsWith("HAS_"))).toBe(false);
    expect(v.edges.some((e) => e.type === "MUST_PERFORM")).toBe(true);
  });

  it("shows them when structure is switched on", () => {
    const v = buildView(clean, { ...base, showStructure: true });
    expect(v.nodes.some((n) => n.type === "DOCUMENT")).toBe(true);
    expect(v.edges.filter((e) => e.type === "HAS_ENTITY")).toHaveLength(3);
  });

  it("removes a hidden type and every edge that touched it", () => {
    const v = buildView(clean, { ...base, hidden: new Set<GraphNodeType>(["CLAUSE"]) });
    expect(v.nodes.some((n) => n.type === "CLAUSE")).toBe(false);
    expect(v.edges.some((e) => e.from === "clause:c1" || e.to === "clause:c1")).toBe(false);
  });

  it("key facts only drops entities that take part in nothing, and says how many", () => {
    const v = buildView(clean, { ...base, keyFactsOnly: true });
    expect(v.nodes.map((n) => n.id)).not.toContain("entity:lonely");
    expect(v.nodes.map((n) => n.id)).toContain("entity:buyer");
    expect(v.isolatedHidden).toBe(1);
  });

  it("never returns an edge whose endpoint is not in the nodes", () => {
    for (const hidden of [[], ["ENTITY"], ["OBLIGATION", "RISK_FINDING"]] as GraphNodeType[][]) {
      const v = buildView(clean, { ...base, hidden: new Set(hidden), keyFactsOnly: true });
      const ids = new Set(v.nodes.map((n) => n.id));
      for (const e of v.edges) {
        expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
      }
    }
  });
});

describe("neighboursOf / rawId", () => {
  it("lists neighbours with the edge and its direction, regardless of filters", () => {
    const ns = neighboursOf(sanitizeGraph(GRAPH), "obligation:o1");
    const byId = Object.fromEntries(ns.map((n) => [n.node.id, n.direction]));
    expect(byId["entity:buyer"]).toBe("in");
    expect(byId["entity:price"]).toBe("out");
    expect(byId["document:d"]).toBe("in");
  });

  it("strips the type namespace from an id", () => {
    expect(rawId("entity:8f1a")).toBe("8f1a");
    expect(rawId("event:o:1")).toBe("o:1");
    expect(rawId("bare")).toBe("bare");
  });
});

describe("evidenceTarget", () => {
  const g = sanitizeGraph({
    ...GRAPH,
    nodes: [
      ...GRAPH.nodes.filter((n) => n.id !== "obligation:o1"),
      node("obligation:o1", "OBLIGATION", { textStart: 120, textEnd: 160 }),
      node("event:o1", "EVENT"),
    ],
    edges: [...GRAPH.edges, edge("DUE_ON", "obligation:o1", "event:o1")],
  });
  const byId = (id: string) => g.nodes.find((n) => n.id === id)!;
  const clauseAt = (offset: number) => (offset >= 100 && offset < 200 ? "c-body" : null);

  it("is the node itself for an entity and a clause", () => {
    expect(evidenceTarget(g, byId("entity:price"))).toEqual({
      clauseIds: [],
      entityIds: ["price"],
    });
    expect(evidenceTarget(g, byId("clause:c1"))).toEqual({ clauseIds: ["c1"], entityIds: [] });
  });

  it("is the flagged evidence for a risk finding", () => {
    expect(evidenceTarget(g, byId("risk:r1"))).toEqual({ clauseIds: [], entityIds: ["price"] });
  });

  it("is the party, the amount and the sentence's clause for an obligation", () => {
    const t = evidenceTarget(g, byId("obligation:o1"), clauseAt);
    expect(t.entityIds.sort()).toEqual(["buyer", "price"]);
    expect(t.clauseIds).toEqual(["c-body"]);
  });

  it("follows a deadline to its obligation", () => {
    const t = evidenceTarget(g, byId("event:o1"), clauseAt);
    expect(t.entityIds.sort()).toEqual(["buyer", "price"]);
    expect(t.clauseIds).toEqual(["c-body"]);
  });

  it("is empty for nodes with no source text", () => {
    expect(evidenceTarget(g, byId("document:d"))).toEqual({ clauseIds: [], entityIds: [] });
  });
});
