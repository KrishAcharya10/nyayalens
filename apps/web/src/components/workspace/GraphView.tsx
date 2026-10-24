"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { DocumentGraph, GraphNode, GraphNodeType } from "@/lib/apiTypes";
import {
  edgeKind,
  edgeLabel,
  NODE_KIND,
  NODE_STYLE,
  nodeTitle,
  nodeValue,
} from "@/lib/graphLabels";
import { layoutGraph } from "@/lib/graphLayout";
import {
  buildView,
  evidenceTarget,
  neighboursOf,
  NODE_TYPE_ORDER,
  sanitizeGraph,
  type EvidenceTarget,
  type Neighbour,
} from "@/lib/graphModel";
import { EmptyState } from "@/components/ui/States";
import { GraphDetails } from "./GraphDetails";
import { GraphLegend } from "./GraphLegend";

// The knowledge graph of one document, drawn with React Flow.
//
// What makes it usable, and not just present:
//   - it opens on the document's KEY FACTS: entities that take part in a
//     relation, duty or finding, plus the duties, deadlines and findings
//     themselves. Clauses, legal references, the document node and its
//     "belongs to the document" lines are one click away, because drawn by
//     default they bury the meaning under a hairball;
//   - a deterministic layered layout (lib/graphLayout.ts), fitted to the
//     canvas whenever it or the filters change;
//   - selecting a node dims everything not connected to it and opens a details
//     panel with its source text and a way to follow each connection;
//   - labelled zoom / fit / reset controls, a legend, and honest empty states.

// Node size; a narrow canvas (tablet portrait, phone) gets smaller cards and
// tighter columns so the graph stays at a readable zoom.
const GEOMETRY = {
  normal: { width: 196, height: 56, columnGap: 110 },
  compact: { width: 150, height: 52, columnGap: 64 },
};
const COMPACT_PX = 640;
const MIN_READABLE_ZOOM = 0.5;
const DEFAULT_HIDDEN: GraphNodeType[] = ["CLAUSE", "LEGAL_REFERENCE"];
const WIDE_PX = 720;

interface CardData {
  node: GraphNode;
  title: string;
  value: string | null;
  selected: boolean;
  dimmed: boolean;
  width: number;
  height: number;
  onSelect: (id: string) => void;
}

const HANDLE = "!h-1 !w-1 !border-0 !bg-transparent !opacity-0";

const CardNode = memo(function CardNode({ data }: NodeProps<CardData>) {
  const style = NODE_STYLE[data.node.type];
  const label = `${NODE_KIND[data.node.type].singular}: ${data.title}${data.value ? `, ${data.value}` : ""}`;
  return (
    <>
      <Handle
        id="tl"
        type="target"
        position={Position.Left}
        className={HANDLE}
        isConnectable={false}
      />
      <Handle
        id="sr"
        type="source"
        position={Position.Right}
        className={HANDLE}
        isConnectable={false}
      />
      <Handle
        id="sl"
        type="source"
        position={Position.Left}
        className={HANDLE}
        isConnectable={false}
      />
      <Handle
        id="tr"
        type="target"
        position={Position.Right}
        className={HANDLE}
        isConnectable={false}
      />
      <button
        type="button"
        aria-pressed={data.selected}
        aria-label={label}
        title={label}
        onClick={() => data.onSelect(data.node.id)}
        className="relative flex items-stretch overflow-hidden rounded-md border text-left transition-opacity"
        style={{
          width: data.width,
          height: data.height,
          background: style.bg,
          borderColor: data.selected ? style.accent : style.border,
          borderWidth: data.selected ? 2 : 1,
          color: style.text,
          opacity: data.dimmed ? 0.3 : 1,
        }}
      >
        <span aria-hidden="true" className="w-1 shrink-0" style={{ background: style.accent }} />
        <span className="flex min-w-0 flex-1 flex-col justify-center px-2.5">
          <span className="truncate text-[12px] font-semibold leading-tight">{data.title}</span>
          {data.value && (
            <span className="mt-0.5 truncate text-[11px] leading-tight opacity-90">
              {data.value}
            </span>
          )}
        </span>
      </button>
    </>
  );
});

// An edge between two nodes in the same column: a bracket on the right-hand
// side, so it does not cut straight through the nodes in between.
function ArcEdge({ id, sourceX, sourceY, targetX, targetY, style, label, markerEnd }: EdgeProps) {
  const bulge = 34 + Math.min(110, Math.abs(targetY - sourceY) * 0.25);
  const x = Math.max(sourceX, targetX) + bulge;
  const path = `M ${sourceX},${sourceY} C ${x},${sourceY} ${x},${targetY} ${targetX},${targetY}`;
  const lx = (sourceX + targetX) / 8 + (6 * x) / 8;
  const ly = (sourceY + targetY) / 2;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(style ? { style } : {})}
        {...(markerEnd ? { markerEnd } : {})}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded bg-paper-50/90 px-1 py-px text-[10px] text-ink-500"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { card: CardNode };
const edgeTypes = { arc: ArcEdge };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface GraphViewProps {
  graph: DocumentGraph | null | undefined;
  /** Highlight a node's source in the document (clause / entity ids). */
  onShowInDocument?: (target: EvidenceTarget) => void;
  /** Open a node's full record in the matching workspace tab. */
  onOpenInTab?: (node: GraphNode) => void;
  /** Map a text offset to the clause that contains it (for obligation sources). */
  clauseAt?: (offset: number) => string | null;
  /** Offer a button that opens the same graph full-screen. */
  onExpand?: () => void;
  showMiniMap?: boolean;
  /** Node types switched off when the view first opens. */
  initialHidden?: GraphNodeType[];
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphWorkbench {...props} />
    </ReactFlowProvider>
  );
}

function GraphWorkbench({
  graph,
  onShowInDocument,
  onOpenInTab,
  clauseAt,
  onExpand,
  showMiniMap = false,
  initialHidden = DEFAULT_HIDDEN,
}: GraphViewProps) {
  const rf = useReactFlow();
  const rootRef = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  const [compact, setCompact] = useState(false);
  const geo = compact ? GEOMETRY.compact : GEOMETRY.normal;
  const [hidden, setHidden] = useState<Set<GraphNodeType>>(() => new Set(initialHidden));
  const [keyFactsOnly, setKeyFactsOnly] = useState(true);
  const [showStructure, setShowStructure] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clean = useMemo(() => sanitizeGraph(graph), [graph]);
  const view = useMemo(
    () => buildView(clean, { hidden, showStructure, keyFactsOnly }),
    [clean, hidden, showStructure, keyFactsOnly],
  );
  const layout = useMemo(
    () =>
      layoutGraph(view.nodes, view.edges, {
        nodeWidth: geo.width,
        nodeHeight: geo.height,
        columnGap: geo.columnGap,
      }),
    [view, geo],
  );
  const adjacency = useMemo(() => {
    const m = new Map<string, Neighbour[]>();
    for (const n of clean.nodes) m.set(n.id, neighboursOf(clean, n.id));
    return m;
  }, [clean]);
  const titleOf = useCallback(
    (n: GraphNode) => nodeTitle(n, adjacency.get(n.id) ?? []),
    [adjacency],
  );

  const selected = selectedId ? (clean.nodes.find((n) => n.id === selectedId) ?? null) : null;
  const selectedNeighbours = useMemo(
    () => (selected ? (adjacency.get(selected.id) ?? []) : []),
    [selected, adjacency],
  );
  const neighbourIds = useMemo(
    () => new Set(selectedNeighbours.map((n) => n.node.id)),
    [selectedNeighbours],
  );

  const counts = useMemo(() => {
    const c = new Map<GraphNodeType, number>();
    for (const n of clean.nodes) c.set(n.type, (c.get(n.type) ?? 0) + 1);
    return c;
  }, [clean]);
  const nodeTypesPresent = useMemo(() => new Set(counts.keys()), [counts]);
  const edgeTypesPresent = useMemo(() => new Set(clean.edges.map((e) => e.type)), [clean]);

  // --- fitting the viewport -----------------------------------------------
  const fit = useCallback(() => {
    // Nothing to fit into until the canvas has a size (hidden pane, first paint).
    const el = rootRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    const pad = 24;
    const fitted = Math.min(
      el.clientWidth / (layout.width + 2 * pad),
      el.clientHeight / (layout.height + 2 * pad),
    );
    if (Number.isFinite(fitted) && fitted < MIN_READABLE_ZOOM && layout.nodes.length > 0) {
      // Fitting everything would make the text unreadable: show it at a readable
      // size from the top-left and let the reader pan.
      rf.setViewport({ x: pad, y: pad, zoom: MIN_READABLE_ZOOM }, { duration: 0 });
      return;
    }
    rf.fitView({
      padding: 0.12,
      minZoom: 0.2,
      maxZoom: 1.1,
      duration: prefersReducedMotion() ? 0 : 200,
    });
  }, [rf, layout]);
  const signature = `${view.nodes.length}:${view.edges.length}:${[...hidden].sort().join(",")}`;
  useEffect(() => {
    const t = setTimeout(fit, 60);
    return () => clearTimeout(t);
  }, [signature, fit]);

  // Refit when the canvas is resized (the panel widens for the graph), and
  // choose where the details panel sits from the width available.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setWide(width >= WIDE_PX);
      setCompact(width > 0 && width < COMPACT_PX);
      clearTimeout(timer);
      timer = setTimeout(fit, 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [fit]);

  // --- selection ---------------------------------------------------------
  const select = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : id)), []);

  // Selecting a node the filters hide (via a connection in the details panel)
  // switches off the filter that was hiding it.
  const reveal = useCallback((node: GraphNode) => {
    setHidden((prev) => {
      if (!prev.has(node.type)) return prev;
      const next = new Set(prev);
      next.delete(node.type);
      return next;
    });
    if (node.type === "ENTITY") setKeyFactsOnly(false);
    if (node.type === "DOCUMENT") setShowStructure(true);
    setSelectedId(node.id);
  }, []);

  // Bring a newly selected node into view.
  useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => {
      const placed = layout.nodes.find((p) => p.id === selectedId);
      if (!placed) return;
      rf.setCenter(placed.x + placed.width / 2, placed.y + placed.height / 2, {
        zoom: Math.max(rf.getZoom(), 0.75),
        duration: prefersReducedMotion() ? 0 : 200,
      });
    }, 80);
    return () => clearTimeout(t);
  }, [selectedId, layout, rf]);

  const toggleType = (t: GraphNodeType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const reset = () => {
    setHidden(new Set(initialHidden));
    setKeyFactsOnly(true);
    setShowStructure(false);
    setSelectedId(null);
    setTimeout(fit, 80);
  };

  // --- React Flow nodes and edges ----------------------------------------
  const placedById = useMemo(() => new Map(layout.nodes.map((p) => [p.id, p])), [layout]);
  const nodes = useMemo<Node<CardData>[]>(
    () =>
      view.nodes.flatMap((n) => {
        const p = placedById.get(n.id);
        if (!p) return [];
        return [
          {
            id: n.id,
            type: "card",
            position: { x: p.x, y: p.y },
            draggable: false,
            selectable: false,
            focusable: false,
            // React Flow turns pointer events off for nodes that are neither
            // draggable nor selectable, which would stop the card button being clicked.
            style: { width: geo.width, height: geo.height, pointerEvents: "all" },
            data: {
              node: n,
              title: titleOf(n),
              value: nodeValue(n),
              selected: n.id === selectedId,
              dimmed: selectedId !== null && n.id !== selectedId && !neighbourIds.has(n.id),
              width: geo.width,
              height: geo.height,
              onSelect: select,
            },
          },
        ];
      }),
    [view.nodes, placedById, titleOf, selectedId, neighbourIds, select, geo],
  );
  const edges = useMemo<Edge[]>(
    () =>
      view.edges.flatMap((e, i) => {
        const a = placedById.get(e.from);
        const b = placedById.get(e.to);
        if (!a || !b) return [];
        const kind = edgeKind(e.type);
        const incident = selectedId !== null && (e.from === selectedId || e.to === selectedId);
        const faded = selectedId !== null && !incident;
        const sameColumn = a.x === b.x;
        const forward = a.x < b.x;
        const text = kind.labelled || incident ? edgeLabel(e) : undefined;
        const directed = e.type !== "CONTRADICTS" && e.type !== "COMPARED_WITH";
        return [
          {
            id: `${e.type}:${e.from}:${e.to}:${i}`,
            source: e.from,
            target: e.to,
            type: sameColumn ? "arc" : "default",
            sourceHandle: sameColumn || forward ? "sr" : "sl",
            targetHandle: sameColumn ? "tr" : forward ? "tl" : "tr",
            ...(text ? { label: text } : {}),
            labelStyle: { fontSize: 10, fill: "#4a5468" },
            labelBgStyle: { fill: "#fdfcfa", fillOpacity: 0.92 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 3,
            style: {
              stroke: kind.stroke,
              strokeWidth: kind.width + (incident ? 0.75 : 0),
              ...(kind.dash ? { strokeDasharray: kind.dash } : {}),
              opacity: faded ? 0.12 : 1,
            },
            ...(directed
              ? {
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 14,
                    height: 14,
                    color: kind.stroke,
                  },
                }
              : {}),
            focusable: false,
            zIndex: incident ? 10 : 0,
          },
        ];
      }),
    [view.edges, placedById, selectedId],
  );

  const nothingToBuild = clean.nodes.filter((n) => n.type !== "DOCUMENT").length === 0;
  const evidence: EvidenceTarget = selected
    ? evidenceTarget(clean, selected, clauseAt)
    : { clauseIds: [], entityIds: [] };
  const ignored = clean.dropped.nodes + clean.dropped.edges;
  const button =
    "h-7 rounded border border-ink-200 bg-paper-50 px-2.5 text-xs font-medium text-ink-700 hover:bg-paper-200";

  return (
    <section
      ref={rootRef}
      aria-label="Knowledge graph"
      className="flex h-full min-h-[320px] w-full flex-col bg-paper-50"
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-ink-100 px-3 py-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Show node types"
        >
          {NODE_TYPE_ORDER.filter((t) => t !== "DOCUMENT" && counts.has(t)).map((t) => {
            const on = !hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                  on
                    ? "border-ink-300 bg-paper-50 font-medium text-ink-800"
                    : "border-dashed border-ink-300 bg-transparent text-ink-500 hover:bg-paper-200"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-sm border"
                  style={{
                    background: on ? NODE_STYLE[t].bg : "transparent",
                    borderColor: NODE_STYLE[t].accent,
                  }}
                />
                {NODE_KIND[t].plural} {counts.get(t)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={keyFactsOnly}
              onChange={(e) => setKeyFactsOnly(e.target.checked)}
            />
            Key facts only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={showStructure}
              onChange={(e) => setShowStructure(e.target.checked)}
            />
            Document links
          </label>
          <div
            className="ml-auto flex items-center gap-1.5"
            role="group"
            aria-label="View controls"
          >
            <button
              type="button"
              className={button}
              onClick={() => rf.zoomOut({ duration: 120 })}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className={button}
              onClick={() => rf.zoomIn({ duration: 120 })}
              aria-label="Zoom in"
            >
              +
            </button>
            <button type="button" className={button} onClick={fit} aria-label="Fit graph to view">
              Fit
            </button>
            <button type="button" className={button} onClick={reset} aria-label="Reset view">
              Reset
            </button>
            {onExpand && (
              <button type="button" className={button} onClick={onExpand}>
                Expand
              </button>
            )}
          </div>
        </div>
        {(keyFactsOnly && view.isolatedHidden > 0) || ignored > 0 ? (
          <p className="text-xs text-ink-500" role="status">
            {keyFactsOnly && view.isolatedHidden > 0 && (
              <>
                {view.isolatedHidden} entit{view.isolatedHidden === 1 ? "y" : "ies"} with no
                relations {view.isolatedHidden === 1 ? "is" : "are"} hidden.{" "}
                <button
                  type="button"
                  onClick={() => setKeyFactsOnly(false)}
                  className="font-medium text-info-strong hover:underline"
                >
                  Show all
                </button>{" "}
              </>
            )}
            {ignored > 0 &&
              `${ignored} malformed item${ignored === 1 ? " was" : "s were"} ignored.`}
          </p>
        ) : null}
      </div>

      {nothingToBuild ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="Not enough extracted data yet to build a graph."
            hint="The graph links parties, amounts, dates, duties and findings once the document has been analysed."
          />
        </div>
      ) : (
        <div className={`flex min-h-0 flex-1 ${wide ? "flex-row" : "flex-col"}`}>
          <div className="relative min-h-[220px] min-w-0 flex-1">
            {view.nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  title="Nothing to show with the current filters."
                  action={
                    <button type="button" onClick={reset} className={`${button} mt-2`}>
                      Reset filters
                    </button>
                  }
                />
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onPaneClick={() => setSelectedId(null)}
                minZoom={0.2}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                fitView
                fitViewOptions={{ padding: 0.12, minZoom: 0.2, maxZoom: 1.1 }}
              >
                <Background gap={20} size={1} color="#e5e7eb" />
                {showMiniMap && (
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={(n) => NODE_STYLE[(n.data as CardData).node.type].accent}
                    maskColor="rgba(244, 245, 247, 0.6)"
                  />
                )}
              </ReactFlow>
            )}
            <GraphLegend nodeTypes={nodeTypesPresent} edgeTypes={edgeTypesPresent} />
          </div>
          {selected && (
            <div
              className={`flex min-h-0 shrink-0 border-ink-200 ${
                wide ? "w-[300px] border-l" : "max-h-[46%] border-t"
              }`}
            >
              <GraphDetails
                node={selected}
                neighbours={selectedNeighbours}
                titleOf={titleOf}
                evidence={evidence}
                onSelect={reveal}
                onClose={() => setSelectedId(null)}
                onShowInDocument={onShowInDocument}
                onOpenInTab={onOpenInTab}
              />
            </div>
          )}
        </div>
      )}
      <span className="sr-only" role="status">
        {view.nodes.length} items and {view.edges.length} connections shown.
      </span>
    </section>
  );
}
