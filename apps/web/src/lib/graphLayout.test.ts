import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, GraphNodeType } from "./apiTypes";
import { countCrossings, DEFAULT_LAYOUT, layoutGraph } from "./graphLayout";

const node = (id: string, type: GraphNodeType, textStart: number | null = null): GraphNode => ({
  id,
  type,
  label: id,
  text: null,
  textStart,
  textEnd: null,
});
const rel = (from: string, to: string): GraphEdge => ({ type: "RELATION", from, to });

// A small deterministic pseudo-random generator, so the "many nodes" cases are reproducible.
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function randomGraph(counts: Partial<Record<GraphNodeType, number>>, seed: number) {
  const r = rng(seed);
  const nodes: GraphNode[] = [];
  for (const [type, n] of Object.entries(counts) as Array<[GraphNodeType, number]>) {
    for (let i = 0; i < n; i++) nodes.push(node(`${type}:${i}`, type, Math.floor(r() * 5000)));
  }
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length * 1.5; i++) {
    const a = nodes[Math.floor(r() * nodes.length)]!;
    const b = nodes[Math.floor(r() * nodes.length)]!;
    if (a.id !== b.id) edges.push(rel(a.id, b.id));
  }
  return { nodes, edges };
}

function overlaps(layout: ReturnType<typeof layoutGraph>): number {
  let n = 0;
  const p = layout.nodes;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const a = p[i]!;
      const b = p[j]!;
      if (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      ) {
        n++;
      }
    }
  }
  return n;
}

describe("layoutGraph", () => {
  it("handles an empty graph", () => {
    expect(layoutGraph([], [])).toEqual({ nodes: [], width: 0, height: 0 });
  });

  it("gives every node a finite position and never overlaps two nodes - small, medium and large graphs", () => {
    for (const [counts, seed] of [
      [{ ENTITY: 3, OBLIGATION: 2 }, 1],
      [{ CLAUSE: 14, ENTITY: 28, OBLIGATION: 7, EVENT: 2, RISK_FINDING: 3, LEGAL_REFERENCE: 3 }, 2],
      [{ CLAUSE: 80, ENTITY: 200, OBLIGATION: 60, RISK_FINDING: 25 }, 3],
    ] as Array<[Partial<Record<GraphNodeType, number>>, number]>) {
      const { nodes, edges } = randomGraph(counts, seed);
      const layout = layoutGraph(nodes, edges);
      expect(layout.nodes).toHaveLength(nodes.length);
      for (const p of layout.nodes) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
      expect(overlaps(layout)).toBe(0);
    }
  });

  it("is deterministic", () => {
    const { nodes, edges } = randomGraph({ CLAUSE: 10, ENTITY: 20, OBLIGATION: 6 }, 9);
    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges));
  });

  it("wraps a tall column into sub-columns so no column exceeds maxRows", () => {
    const nodes = Array.from({ length: 60 }, (_, i) => node(`e${i}`, "ENTITY", i));
    const layout = layoutGraph(nodes, []);
    const rows = Math.ceil(DEFAULT_LAYOUT.maxRows);
    const maxY = rows * (DEFAULT_LAYOUT.nodeHeight + DEFAULT_LAYOUT.rowGap);
    expect(Math.max(...layout.nodes.map((n) => n.y))).toBeLessThan(maxY);
    expect(new Set(layout.nodes.map((n) => n.x)).size).toBe(Math.ceil(60 / rows));
    expect(layout.height).toBeLessThanOrEqual(maxY);
  });

  it("puts node types in columns, left to right, in meaning order", () => {
    const layout = layoutGraph(
      [
        node("r", "RISK_FINDING"),
        node("o", "OBLIGATION"),
        node("e", "ENTITY"),
        node("c", "CLAUSE"),
      ],
      [],
    );
    const x = Object.fromEntries(layout.nodes.map((n) => [n.id, n.x]));
    expect(x.c).toBeLessThan(x.e!);
    expect(x.e).toBeLessThan(x.o!);
    expect(x.o).toBeLessThan(x.r!);
  });

  it("orders nodes to remove avoidable edge crossings", () => {
    // Three entities in document order, each linked to the obligation that sits
    // opposite in the starting order (e0-o2, e1-o1, e2-o0): fully crossed until sorted.
    const nodes = [
      node("e0", "ENTITY", 1),
      node("e1", "ENTITY", 2),
      node("e2", "ENTITY", 3),
      node("o0", "OBLIGATION", 1),
      node("o1", "OBLIGATION", 2),
      node("o2", "OBLIGATION", 3),
    ];
    const edges = [rel("e0", "o2"), rel("e1", "o1"), rel("e2", "o0")];
    const unsorted = layoutGraph(nodes, edges, { sweeps: 0 });
    const sorted = layoutGraph(nodes, edges, { sweeps: 4 });
    expect(countCrossings(unsorted, edges)).toBeGreaterThan(0);
    expect(countCrossings(sorted, edges)).toBe(0);
  });

  it("ignores edges to nodes that are not in the graph", () => {
    const layout = layoutGraph([node("a", "ENTITY")], [rel("a", "ghost"), rel("ghost", "a")]);
    expect(layout.nodes).toHaveLength(1);
  });
});
