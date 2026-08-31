import { useEffect, useRef } from "react";
import type { DocumentClause } from "@/lib/apiTypes";
import { EmptyState } from "@/components/ui/States";
import { EvidenceButton } from "./EvidenceButton";
import { humanizeLabel } from "@/lib/format";

// Exported so GraphView's node-click detail (Section 18) reuses this
// exact card for a graph CLAUSE node instead of a second detail view.
export function ClauseCard({
  clause,
  highlighted = false,
}: {
  clause: DocumentClause;
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={`rounded border bg-paper-50 p-2.5 transition-colors ${
        highlighted ? "border-saffron-500 ring-1 ring-saffron-300" : "border-ink-100"
      }`}
    >
      <div className="flex items-center gap-2">
        {clause.clauseNumber && (
          <span className="text-meta text-ink-400">#{clause.clauseNumber}</span>
        )}
        <span className="text-clause-title text-ink-700">{humanizeLabel(clause.clauseType)}</span>
      </div>
      {clause.text && (
        <p className="mt-1 line-clamp-2 text-sm text-ink-600">{clause.text.trim()}</p>
      )}
      <div className="mt-1.5">
        <EvidenceButton clauseIds={[clause.id]} />
      </div>
    </div>
  );
}

export function ClauseTab({
  clauses,
  highlightId,
}: {
  clauses: DocumentClause[];
  highlightId?: string | null;
}) {
  const ruleBased = clauses.filter((c) => c.modelSource === "RULE_BASED");

  if (ruleBased.length === 0) {
    return <EmptyState title="No clauses were classified." />;
  }

  return (
    <div className="flex flex-col gap-1.5 p-3">
      {ruleBased.map((clause) => (
        <ClauseCard key={clause.id} clause={clause} highlighted={clause.id === highlightId} />
      ))}
    </div>
  );
}
