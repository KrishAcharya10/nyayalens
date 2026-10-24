// Pure helpers between the API's knowledge-graph response and what the graph
// view draws: cleaning malformed data, deciding which nodes and edges are
// shown for the current filters, and finding a node's neighbours. No React and
// no layout here, so it is all unit-testable.
import type { DocumentGraph, GraphEdge, GraphEdgeType, GraphNode, GraphNodeType } from "./apiTypes";

/** Left-to-right order of the node types in the layout. */
export const NODE_TYPE_ORDER: GraphNodeType[] = [
  "LEGAL_REFERENCE",
  "DOCUMENT",
  "CLAUSE",
  "ENTITY",
  "OBLIGATION",
  "EVENT",
  "RISK_FINDING",
];

const KNOWN_TYPES = new Set<string>(NODE_TYPE_ORDER);

/**
 * Edges that only say "this belongs to the document". They add no
 * information and, drawn, make a hairball of lines from one node to
 * everything, so they are hidden unless the user asks for them.
 */
export const STRUCTURAL_EDGE_TYPES = new Set<GraphEdgeType>([
  "HAS_ENTITY",
  "HAS_CLAUSE",
  "HAS_OBLIGATION",
]);

export interface CleanGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** What was dropped as malformed, so the UI can say so instead of hiding it. */
  dropped: { nodes: number; edges: number };
}

const asNumberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Accepts whatever the API returned and yields a graph the view can trust:
 * nodes with a string id and a known type (first one wins on a duplicate id),
 * and edges between two distinct existing nodes (no dangling, self or
 * repeated edges). Anything else is counted and dropped, never thrown on.
 */
export function sanitizeGraph(raw: DocumentGraph | null | undefined): CleanGraph {
  const rawNodes: unknown[] = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const rawEdges: unknown[] = Array.isArray(raw?.edges) ? raw.edges : [];
  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  let droppedNodes = 0;
  for (const item of rawNodes) {
    const n = (item ?? {}) as Partial<GraphNode>;
    if (typeof n.id !== "string" || !n.id || !KNOWN_TYPES.has(String(n.type)) || ids.has(n.id)) {
      droppedNodes++;
      continue;
    }
    ids.add(n.id);
    nodes.push({
      id: n.id,
      type: n.type as GraphNodeType,
      label: typeof n.label === "string" ? n.label : "",
      text: typeof n.text === "string" ? n.text : null,
      textStart: asNumberOrNull(n.textStart),
      textEnd: asNumberOrNull(n.textEnd),
      ...(typeof n.category === "string" ? { category: n.category } : {}),
    });
  }
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  let droppedEdges = 0;
  for (const item of rawEdges) {
    const e = (item ?? {}) as Partial<GraphEdge>;
    const key = `${e.type}|${e.from}|${e.to}|${e.label ?? ""}`;
    if (
      typeof e.type !== "string" ||
      typeof e.from !== "string" ||
      typeof e.to !== "string" ||
      e.from === e.to ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      seen.has(key)
    ) {
      droppedEdges++;
      continue;
    }
    seen.add(key);
    edges.push({
      type: e.type,
      from: e.from,
      to: e.to,
      ...(typeof e.label === "string" ? { label: e.label } : {}),
    });
  }
  return { nodes, edges, dropped: { nodes: droppedNodes, edges: droppedEdges } };
}

export interface ViewOptions {
  /** Node types switched off in the legend. */
  hidden: ReadonlySet<GraphNodeType>;
  /** Show the document node and the "belongs to the document" edges. */
  showStructure: boolean;
  /** Hide entities that take part in no relation, obligation or finding. */
  keyFactsOnly: boolean;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Entities hidden only because they are isolated (key facts only). */
  isolatedHidden: number;
}

/** The nodes and edges drawn for the current filters. */
export function buildView(graph: CleanGraph, options: ViewOptions): GraphView {
  const typeVisible = (n: GraphNode) =>
    !options.hidden.has(n.type) && (n.type !== "DOCUMENT" || options.showStructure);
  let nodes = graph.nodes.filter(typeVisible);
  let ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) =>
      ids.has(e.from) &&
      ids.has(e.to) &&
      (options.showStructure || !STRUCTURAL_EDGE_TYPES.has(e.type)),
  );
  let isolatedHidden = 0;
  if (options.keyFactsOnly) {
    const connected = new Set<string>();
    for (const e of edges) {
      if (STRUCTURAL_EDGE_TYPES.has(e.type)) continue;
      connected.add(e.from);
      connected.add(e.to);
    }
    const before = nodes.length;
    nodes = nodes.filter((n) => n.type !== "ENTITY" || connected.has(n.id));
    isolatedHidden = before - nodes.length;
    ids = new Set(nodes.map((n) => n.id));
  }
  return {
    nodes,
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    isolatedHidden,
  };
}

export interface Neighbour {
  node: GraphNode;
  edge: GraphEdge;
  /** "out": the selected node is the edge's source; "in": its target. */
  direction: "out" | "in";
}

/** Every node joined to `id` by an edge (in the full graph, whatever is filtered), with the edge. */
export function neighboursOf(graph: CleanGraph, id: string): Neighbour[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Neighbour[] = [];
  for (const e of graph.edges) {
    if (e.from === id) {
      const node = byId.get(e.to);
      if (node) out.push({ node, edge: e, direction: "out" });
    } else if (e.to === id) {
      const node = byId.get(e.from);
      if (node) out.push({ node, edge: e, direction: "in" });
    }
  }
  return out;
}

/** The id the API namespaces by node type ("entity:<uuid>" -> "<uuid>"). */
export function rawId(nodeId: string): string {
  const at = nodeId.indexOf(":");
  return at < 0 ? nodeId : nodeId.slice(at + 1);
}

export interface EvidenceTarget {
  clauseIds: string[];
  entityIds: string[];
}

/**
 * The document spans a node stands for, as the ids the document viewer
 * highlights. An entity or clause is itself; a risk finding is the evidence
 * it flags; an obligation is its party, its amount and the clause its
 * sentence sits in; a deadline is its obligation's. Nodes with no source text
 * (the document, legal references) have none.
 */
export function evidenceTarget(
  graph: CleanGraph,
  node: GraphNode,
  clauseAt: (offset: number) => string | null = () => null,
): EvidenceTarget {
  const clauseIds = new Set<string>();
  const entityIds = new Set<string>();
  const addNeighbours = (id: string, types: GraphEdgeType[]) => {
    for (const n of neighboursOf(graph, id)) {
      if (!types.includes(n.edge.type)) continue;
      if (n.node.type === "ENTITY") entityIds.add(rawId(n.node.id));
      if (n.node.type === "CLAUSE") clauseIds.add(rawId(n.node.id));
    }
  };
  const addClauseAt = (n: GraphNode) => {
    const id = n.textStart === null ? null : clauseAt(n.textStart);
    if (id) clauseIds.add(id);
  };
  switch (node.type) {
    case "ENTITY":
      entityIds.add(rawId(node.id));
      break;
    case "CLAUSE":
      clauseIds.add(rawId(node.id));
      break;
    case "RISK_FINDING":
      addNeighbours(node.id, ["FLAGS", "COMPARED_WITH"]);
      break;
    case "OBLIGATION":
      addNeighbours(node.id, ["MUST_PERFORM", "REFERENCES"]);
      addClauseAt(node);
      break;
    case "EVENT":
      for (const n of neighboursOf(graph, node.id)) {
        if (n.edge.type !== "DUE_ON" || n.node.type !== "OBLIGATION") continue;
        addNeighbours(n.node.id, ["MUST_PERFORM", "REFERENCES"]);
        addClauseAt(n.node);
      }
      break;
    default:
      break;
  }
  return { clauseIds: [...clauseIds], entityIds: [...entityIds] };
}
