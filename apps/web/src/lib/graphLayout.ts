// Deterministic layered layout for a document's knowledge graph.
//
// The graph is already layered by meaning - legal references, the document,
// clauses, entities, obligations, deadlines, findings - so each node type is a
// column, left to right. Within a column nodes are ordered to reduce edge
// crossings (barycentre sweeps: a node moves towards the average position of
// the nodes it connects to), starting from document order. A column with many
// nodes wraps into sub-columns so the graph stays wide rather than one tall
// strip that can only be shown unreadably small. No dependency: the same input
// always gives the same positions.
import type { GraphEdge, GraphNode, GraphNodeType } from "./apiTypes";
import { NODE_TYPE_ORDER } from "./graphModel";

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Space between node columns of different types (room for edge labels). */
  columnGap: number;
  /** Space between sub-columns of one type. */
  subColumnGap: number;
  rowGap: number;
  /** A column wraps into sub-columns beyond this many rows. */
  maxRows: number;
  sweeps: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 196,
  nodeHeight: 56,
  columnGap: 110,
  subColumnGap: 28,
  rowGap: 16,
  maxRows: 12,
  sweeps: 4,
};

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: GraphNodeType;
}

export interface Layout {
  nodes: PlacedNode[];
  width: number;
  height: number;
}

function orderWithinLayers(
  layers: GraphNode[][],
  neighbours: Map<string, string[]>,
  sweeps: number,
): void {
  const position = new Map<string, number>();
  const reindex = () => {
    for (const layer of layers) layer.forEach((n, i) => position.set(n.id, i));
  };
  // Start from document order (nodes without an offset go last, by id).
  for (const layer of layers) {
    layer.sort(
      (a, b) =>
        (a.textStart ?? Number.MAX_SAFE_INTEGER) - (b.textStart ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    );
  }
  reindex();
  const layerOf = new Map<string, number>();
  layers.forEach((layer, li) => layer.forEach((n) => layerOf.set(n.id, li)));

  const sweep = (li: number, towards: (neighbourLayer: number) => boolean) => {
    const layer = layers[li]!;
    const keyed = layer.map((n, i) => {
      const ps = (neighbours.get(n.id) ?? [])
        .filter((m) => towards(layerOf.get(m) ?? -1))
        .map((m) => position.get(m) ?? 0);
      // A node with no neighbour in that direction stays where it is.
      return { n, key: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : i, i };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    keyed.forEach((k, i) => {
      layer[i] = k.n;
      position.set(k.n.id, i);
    });
  };
  for (let s = 0; s < sweeps; s++) {
    for (let li = 1; li < layers.length; li++) sweep(li, (nl) => nl < li);
    for (let li = layers.length - 2; li >= 0; li--) sweep(li, (nl) => nl > li);
  }
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: Partial<LayoutOptions> = {},
): Layout {
  const o = { ...DEFAULT_LAYOUT, ...options };
  const layers: GraphNode[][] = NODE_TYPE_ORDER.map((t) =>
    nodes.filter((n) => n.type === t),
  ).filter((l) => l.length > 0);
  const ids = new Set(nodes.map((n) => n.id));
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }
  orderWithinLayers(layers, neighbours, o.sweeps);

  const pitchY = o.nodeHeight + o.rowGap;
  const geometry = layers.map((layer) => {
    const subColumns = Math.max(1, Math.ceil(layer.length / o.maxRows));
    const rows = Math.ceil(layer.length / subColumns);
    return { subColumns, rows, height: rows * pitchY - o.rowGap };
  });
  const tallest = Math.max(0, ...geometry.map((g) => g.height));

  const placed: PlacedNode[] = [];
  let x = 0;
  layers.forEach((layer, li) => {
    const g = geometry[li]!;
    const yOffset = (tallest - g.height) / 2; // centre shorter columns against the tallest
    layer.forEach((n, i) => {
      const sub = Math.floor(i / g.rows);
      placed.push({
        id: n.id,
        type: n.type,
        x: x + sub * (o.nodeWidth + o.subColumnGap),
        y: yOffset + (i % g.rows) * pitchY,
        width: o.nodeWidth,
        height: o.nodeHeight,
      });
    });
    x += g.subColumns * o.nodeWidth + (g.subColumns - 1) * o.subColumnGap + o.columnGap;
  });
  return { nodes: placed, width: Math.max(0, x - o.columnGap), height: tallest };
}

/** Edge crossings between adjacent columns - a measure of how readable a layout is. */
export function countCrossings(layout: Layout, edges: GraphEdge[]): number {
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const e of edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b || a.x === b.x) continue;
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    segs.push({ x1: l.x, y1: l.y, x2: r.x, y2: r.y });
  }
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i]!;
      const q = segs[j]!;
      if (p.x1 !== q.x1 || p.x2 !== q.x2) continue; // only edges between the same pair of columns
      if ((p.y1 - q.y1) * (p.y2 - q.y2) < 0) crossings++;
    }
  }
  return crossings;
}
