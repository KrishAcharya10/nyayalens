import type { GraphEdgeType, GraphNodeType } from "@/lib/apiTypes";
import { EDGE_KINDS, NODE_KIND, NODE_STYLE } from "@/lib/graphLabels";
import { NODE_TYPE_ORDER } from "@/lib/graphModel";

const NODE_MEANING: Record<GraphNodeType, string> = {
  DOCUMENT: "The agreement itself",
  LEGAL_REFERENCE: "Context only - unverified, not a claim that a law applies",
  CLAUSE: "A clause of the agreement",
  ENTITY: "A party, amount, date or other value found in the text",
  OBLIGATION: "Who must do what",
  EVENT: "A deadline attached to a duty",
  RISK_FINDING: "A potential issue flagged for review",
};

// Explains what the colours and lines mean. Lists only what is in this graph,
// so it never describes something the reader cannot see.
export function GraphLegend({
  nodeTypes,
  edgeTypes,
}: {
  nodeTypes: ReadonlySet<GraphNodeType>;
  edgeTypes: ReadonlySet<GraphEdgeType>;
}) {
  const nodes = NODE_TYPE_ORDER.filter((t) => nodeTypes.has(t));
  const edges = EDGE_KINDS.filter(
    (k) =>
      edgeTypes.has(k.type) ||
      (k.type === "HAS_ENTITY" && (edgeTypes.has("HAS_CLAUSE") || edgeTypes.has("HAS_OBLIGATION"))),
  );
  return (
    <details className="group absolute bottom-2 left-2 z-10 max-w-[min(20rem,calc(100%-1rem))] rounded-md border border-ink-200 bg-paper-50/95 text-xs shadow-panel">
      <summary className="cursor-pointer list-none rounded-md px-2.5 py-1.5 font-medium text-ink-600 hover:bg-paper-200">
        <span className="group-open:hidden">Legend</span>
        <span className="hidden group-open:inline">Hide legend</span>
      </summary>
      <div className="max-h-[50vh] overflow-y-auto border-t border-ink-100 px-2.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Nodes</p>
        <ul className="mt-1 flex flex-col gap-1">
          {nodes.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border"
                style={{ background: NODE_STYLE[t].bg, borderColor: NODE_STYLE[t].accent }}
              />
              <span className="text-ink-600">
                <span className="font-medium text-ink-700">{NODE_KIND[t].singular}</span> -{" "}
                {NODE_MEANING[t]}
              </span>
            </li>
          ))}
        </ul>
        {edges.length > 0 && (
          <>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Lines
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {edges.map((k) => (
                <li key={k.type} className="flex items-start gap-2">
                  <svg aria-hidden="true" width="26" height="12" className="mt-0.5 shrink-0">
                    <line
                      x1="1"
                      y1="6"
                      x2="25"
                      y2="6"
                      stroke={k.stroke}
                      strokeWidth={k.width}
                      {...(k.dash ? { strokeDasharray: k.dash } : {})}
                    />
                  </svg>
                  <span className="text-ink-600">
                    <span className="font-medium text-ink-700">{k.label}</span> - {k.meaning}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
