import { useState } from "react";
import type { GraphNode } from "@/lib/apiTypes";
import { edgeVerb, NODE_KIND, NODE_STYLE, NODE_TAB } from "@/lib/graphLabels";
import type { EvidenceTarget, Neighbour } from "@/lib/graphModel";

const MAX_LISTED = 10;

// The selected node, read in full: what it is, the text it came from, the
// nodes it connects to (each one a way to move through the graph), and ways
// to jump to its source in the document or its full record in the panel.
export function GraphDetails({
  node,
  neighbours,
  titleOf,
  evidence,
  onSelect,
  onClose,
  onShowInDocument,
  onOpenInTab,
}: {
  node: GraphNode;
  neighbours: Neighbour[];
  titleOf: (node: GraphNode) => string;
  evidence: EvidenceTarget;
  onSelect: (node: GraphNode) => void;
  onClose: () => void;
  onShowInDocument?: ((target: EvidenceTarget) => void) | undefined;
  onOpenInTab?: ((node: GraphNode) => void) | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const style = NODE_STYLE[node.type];
  const tab = NODE_TAB[node.type];
  const hasEvidence = evidence.clauseIds.length + evidence.entityIds.length > 0;
  const listed = showAll ? neighbours : neighbours.slice(0, MAX_LISTED);
  const sourceLabel =
    node.type === "LEGAL_REFERENCE"
      ? "Reference metadata"
      : node.type === "RISK_FINDING"
        ? null
        : "From the document";

  return (
    <aside
      aria-label="Selected item"
      className="flex min-h-0 flex-col overflow-y-auto border-ink-200 bg-paper-50 text-sm"
    >
      <div className="flex items-start gap-2 border-b border-ink-100 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="mt-1 h-3 w-3 shrink-0 rounded-sm border"
          style={{ background: style.bg, borderColor: style.accent }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
            {NODE_KIND[node.type].singular}
            {node.category ? ` · ${node.category.toLowerCase().replace(/_/g, " ")}` : ""}
          </p>
          <h3 className="break-words text-sm font-semibold text-ink-900">{titleOf(node)}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded px-1.5 py-0.5 text-xs text-ink-500 hover:bg-paper-200 hover:text-ink-800"
        >
          Close
        </button>
      </div>

      {node.text && (
        <div className="border-b border-ink-100 px-3 py-2.5">
          {sourceLabel && <p className="text-[11px] font-medium text-ink-500">{sourceLabel}</p>}
          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line break-words font-serif text-[13px] leading-relaxed text-ink-700">
            {node.text.trim()}
          </p>
        </div>
      )}

      {(onShowInDocument || (onOpenInTab && tab)) && (
        <div className="flex flex-wrap gap-2 border-b border-ink-100 px-3 py-2.5">
          {onShowInDocument && (
            <button
              type="button"
              disabled={!hasEvidence}
              onClick={() => onShowInDocument(evidence)}
              className="h-8 rounded border border-ink-200 bg-paper-50 px-3 text-xs font-medium text-ink-800 hover:bg-paper-200 disabled:cursor-not-allowed disabled:text-ink-400"
            >
              {hasEvidence ? "Show in document" : "No document location"}
            </button>
          )}
          {onOpenInTab && tab && (
            <button
              type="button"
              onClick={() => onOpenInTab(node)}
              className="h-8 rounded border border-ink-200 bg-paper-50 px-3 text-xs font-medium text-ink-800 hover:bg-paper-200"
            >
              Open in {tab.label}
            </button>
          )}
        </div>
      )}

      <div className="px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Connected to ({neighbours.length})
        </p>
        {neighbours.length === 0 ? (
          <p className="mt-1 text-xs text-ink-500">Nothing else in the graph is linked to this.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {listed.map((n, i) => {
              const title = titleOf(n.node);
              const verb = edgeVerb(n.edge);
              // Read as a sentence about the selected node: "Tenant must pay this",
              // "This is due on Deadline".
              return (
                <li key={`${n.node.id}-${n.edge.type}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(n.node)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-paper-200"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-sm border"
                      style={{
                        background: NODE_STYLE[n.node.type].bg,
                        borderColor: NODE_STYLE[n.node.type].accent,
                      }}
                    />
                    {n.direction === "out" ? (
                      <span className="min-w-0 truncate text-ink-600">
                        This {verb} <span className="font-medium text-ink-900">{title}</span>
                      </span>
                    ) : (
                      <span className="min-w-0 truncate text-ink-600">
                        <span className="font-medium text-ink-900">{title}</span> {verb} this
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {neighbours.length > MAX_LISTED && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-1 text-xs font-medium text-info-strong hover:underline"
          >
            {showAll ? "Show fewer" : `Show all ${neighbours.length}`}
          </button>
        )}
      </div>
    </aside>
  );
}
