"use client";

import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { DocumentGraph, GraphNode } from "@/lib/apiTypes";
import { EmptyState } from "@/components/ui/States";
import { humanizeLabel } from "@/lib/format";

const NODE_COLOR: Record<GraphNode["type"], { bg: string; border: string; text: string }> = {
  DOCUMENT: { bg: "#181d27", border: "#181d27", text: "#fdfcfa" },
  CLAUSE: { bg: "#eff3fa", border: "#c3d3ec", text: "#274a80" },
  ENTITY: { bg: "#fbeed9", border: "#eec583", text: "#946222" },
  RISK_FINDING: { bg: "#fdf1f1", border: "#eec3c3", text: "#8a2222" },
  OBLIGATION: { bg: "#eef7f1", border: "#b7dcc4", text: "#24603a" },
  EVENT: { bg: "#f4f0fa", border: "#d3c6ea", text: "#4f3a80" },
  LEGAL_REFERENCE: { bg: "#f4f5f7", border: "#cbd1db", text: "#4a5468" },
};

const TYPE_LABEL: Record<GraphNode["type"], string> = {
  DOCUMENT: "Document",
  CLAUSE: "Clauses",
  ENTITY: "Entities",
  OBLIGATION: "Obligations",
  EVENT: "Deadlines",
  RISK_FINDING: "Risk findings",
  LEGAL_REFERENCE: "Legal references",
};

// Column order, left to right. Legal references sit left of the document
// (reference metadata, not document content); obligations and their
// deadlines sit between the entities they bind and the risk findings.
const COLUMN_ORDER: GraphNode["type"][] = [
  "LEGAL_REFERENCE",
  "DOCUMENT",
  "CLAUSE",
  "ENTITY",
  "OBLIGATION",
  "EVENT",
  "RISK_FINDING",
];

function nodeLabel(node: GraphNode) {
  if (node.type === "DOCUMENT") return "Document";
  const title =
    node.type === "OBLIGATION"
      ? `Must ${humanizeLabel(node.label).toLowerCase()}`
      : humanizeLabel(node.label);
  // Entities and deadlines also show their value ("Buyer" / "Ayushman Sandal").
  const value =
    (node.type === "ENTITY" || node.type === "EVENT") && node.text
      ? node.text.length > 36
        ? `${node.text.slice(0, 35)}…`
        : node.text
      : null;
  return (
    <span className="flex flex-col leading-tight">
      <span>{title}</span>
      {value && <span className="mt-0.5 text-[10px] opacity-75">{value}</span>}
    </span>
  );
}

// Section 18: an established layout library (reactflow), not a
// hand-rolled layout algorithm. A deterministic column-per-type layout
// keeps a single document's graph legible; hidden types drop out and the
// remaining columns close up.
function layoutNodes(nodes: GraphNode[]): Node[] {
  // A type with many nodes (28 entities) wraps into several sub-columns
  // of MAX_ROWS, so the graph is wide rather than one tall strip that
  // fitView can only show at an unreadable zoom.
  const MAX_ROWS = 10;
  const SUB_COLUMN_GAP = 230;
  const TYPE_GAP = 300;
  const ROW_GAP = 60;
  const result: Node[] = [];
  let x = 0;
  for (const type of COLUMN_ORDER) {
    const ofType = nodes.filter((n) => n.type === type);
    if (ofType.length === 0) continue;
    ofType.forEach((node, i) => {
      const color = NODE_COLOR[node.type];
      result.push({
        id: node.id,
        position: { x: x + Math.floor(i / MAX_ROWS) * SUB_COLUMN_GAP, y: (i % MAX_ROWS) * ROW_GAP },
        data: { label: nodeLabel(node) },
        style: {
          background: color.bg,
          border: `1px solid ${color.border}`,
          color: color.text,
          borderRadius: 6,
          fontSize: 12,
          padding: "6px 10px",
          width: node.type === "DOCUMENT" ? 100 : 200,
          textAlign: "left",
        },
      });
    });
    x += (Math.ceil(ofType.length / MAX_ROWS) - 1) * SUB_COLUMN_GAP + TYPE_GAP;
  }
  return result;
}

const EDGE_LABEL: Record<string, string> = {
  HAS_ENTITY: "",
  HAS_CLAUSE: "",
  REFERENCES: "references",
  FLAGS: "flags",
  COMPARED_WITH: "compared with",
  HAS_OBLIGATION: "",
  DUE_ON: "due",
  CONTRADICTS: "contradicts",
  RELEVANT_TO: "reference (unverified)",
};

function edgeLabel(e: DocumentGraph["edges"][number]): string {
  // RELATION / MUST_PERFORM carry their specific type (SELLS_TO, MUST_PAY).
  if ((e.type === "RELATION" || e.type === "MUST_PERFORM") && e.label) {
    return humanizeLabel(e.label).toLowerCase();
  }
  return EDGE_LABEL[e.type] ?? e.type;
}

// `initialHidden` lets the narrow side panel start with the busiest types
// (clauses, legal references) switched off; the legend toggles any type,
// and `onExpand` opens the same graph full-screen.
export function GraphView({
  graph,
  onSelectNode,
  initialHidden = [],
  onExpand,
  showMiniMap = true,
}: {
  graph: DocumentGraph | null;
  onSelectNode: (node: GraphNode) => void;
  initialHidden?: GraphNode["type"][];
  onExpand?: () => void;
  showMiniMap?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<GraphNode["type"]>>(() => new Set(initialHidden));

  const visibleNodes = useMemo(
    () => (graph ? graph.nodes.filter((n) => !hidden.has(n.type)) : []),
    [graph, hidden],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const nodes = useMemo(() => layoutNodes(visibleNodes), [visibleNodes]);
  const counts = useMemo(() => {
    const c = new Map<GraphNode["type"], number>();
    for (const n of graph?.nodes ?? []) c.set(n.type, (c.get(n.type) ?? 0) + 1);
    return c;
  }, [graph]);
  const edges = useMemo<Edge[]>(
    () =>
      graph
        ? graph.edges
            .filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
            .map((e, i) => ({
              id: `${e.from}-${e.type}-${e.to}-${i}`,
              source: e.from,
              target: e.to,
              label: edgeLabel(e),
              style:
                e.type === "CONTRADICTS"
                  ? { stroke: "#c24141", strokeWidth: 1.5 }
                  : e.type === "RELEVANT_TO"
                    ? { stroke: "#9aa4b5", strokeWidth: 1, strokeDasharray: "4 3" }
                    : { stroke: "#9aa4b5", strokeWidth: 1 },
              labelStyle: { fontSize: 10, fill: e.type === "CONTRADICTS" ? "#8a2222" : "#6b7690" },
              animated: e.type === "COMPARED_WITH" || e.type === "CONTRADICTS",
            }))
        : [],
    [graph, visibleIds],
  );

  if (!graph) {
    return <EmptyState title="Loading graph..." />;
  }
  if (graph.nodes.length <= 1) {
    return <EmptyState title="Not enough extracted data yet to build a graph." />;
  }

  const toggle = (t: GraphNode["type"]) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-2 py-1.5">
        {COLUMN_ORDER.filter((t) => t !== "DOCUMENT" && counts.has(t)).map((t) => {
          const on = !hidden.has(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                on
                  ? "border-ink-200 bg-paper-50 text-ink-700"
                  : "border-transparent text-ink-300 line-through"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full border"
                style={{ background: NODE_COLOR[t].bg, borderColor: NODE_COLOR[t].border }}
              />
              {TYPE_LABEL[t]} {counts.get(t)}
            </button>
          );
        })}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-info-strong hover:bg-paper-200"
          >
            Expand
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow
          // Remount on filter change so fitView frames the visible nodes.
          key={[...hidden].sort().join(",")}
          nodes={nodes.map((n) =>
            n.id === selectedId
              ? { ...n, style: { ...n.style, boxShadow: "0 0 0 2px #d99a3f" } }
              : n,
          )}
          edges={edges}
          onNodeClick={(_event, node) => {
            setSelectedId(node.id);
            const graphNode = graph.nodes.find((n) => n.id === node.id);
            if (graphNode) onSelectNode(graphNode);
          }}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          // This is a read-only exploration view (Section 18 asks for pan,
          // zoom, and selection - not rearranging or connecting nodes), so
          // dragging nodes and drawing new edges are both switched off; pan
          // and zoom on the canvas itself stay fully enabled.
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background gap={20} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
          {showMiniMap && (
            <MiniMap
              nodeColor={(n) => (n.style?.background as string) ?? "#cbd1db"}
              maskColor="rgba(244, 245, 247, 0.6)"
              pannable
              zoomable
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
