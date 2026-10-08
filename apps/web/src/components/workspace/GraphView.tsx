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

// Section 18: an established layout library (reactflow), not a
// hand-rolled layout algorithm. A simple deterministic radial-by-type
// layout keeps this legible without needing a heavier layout dependency -
// good enough for a single document's graph (a few dozen nodes at most).
function layoutNodes(nodes: GraphNode[]): Node[] {
  const byType: Record<GraphNode["type"], GraphNode[]> = {
    DOCUMENT: [],
    CLAUSE: [],
    ENTITY: [],
    RISK_FINDING: [],
    OBLIGATION: [],
    EVENT: [],
    LEGAL_REFERENCE: [],
  };
  for (const n of nodes) byType[n.type].push(n);

  // Legal references sit left of the document (they are reference
  // metadata, not document content); obligations and their deadline events
  // sit between the entities they bind and the risk findings.
  const COLUMN_X: Record<GraphNode["type"], number> = {
    LEGAL_REFERENCE: -320,
    DOCUMENT: 0,
    CLAUSE: 320,
    ENTITY: 640,
    OBLIGATION: 960,
    EVENT: 1280,
    RISK_FINDING: 1600,
  };
  const ROW_GAP = 64;

  const result: Node[] = [];
  for (const type of Object.keys(byType) as GraphNode["type"][]) {
    byType[type].forEach((node, i) => {
      const color = NODE_COLOR[node.type];
      result.push({
        id: node.id,
        position: { x: COLUMN_X[type], y: i * ROW_GAP },
        data: { label: node.type === "DOCUMENT" ? "Document" : `${humanizeLabel(node.label)}` },
        style: {
          background: color.bg,
          border: `1px solid ${color.border}`,
          color: color.text,
          borderRadius: 6,
          fontSize: 12,
          padding: "6px 10px",
          width: node.type === "DOCUMENT" ? 100 : 180,
        },
      });
    });
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

export function GraphView({
  graph,
  onSelectNode,
}: {
  graph: DocumentGraph | null;
  onSelectNode: (node: GraphNode) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo(() => (graph ? layoutNodes(graph.nodes) : []), [graph]);
  const edges = useMemo<Edge[]>(
    () =>
      graph
        ? graph.edges.map((e, i) => ({
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
    [graph],
  );

  if (!graph) {
    return <EmptyState title="Loading graph..." />;
  }
  if (graph.nodes.length <= 1) {
    return <EmptyState title="Not enough extracted data yet to build a graph." />;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes.map((n) =>
          n.id === selectedId ? { ...n, style: { ...n.style, boxShadow: "0 0 0 2px #d99a3f" } } : n,
        )}
        edges={edges}
        onNodeClick={(_event, node) => {
          setSelectedId(node.id);
          const graphNode = graph.nodes.find((n) => n.id === node.id);
          if (graphNode) onSelectNode(graphNode);
        }}
        fitView
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
        <MiniMap
          nodeColor={(n) => (n.style?.background as string) ?? "#cbd1db"}
          maskColor="rgba(244, 245, 247, 0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
