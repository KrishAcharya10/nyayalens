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
      className={`flex gap-3 rounded-lg border bg-paper-50 p-3 transition-colors ${
        highlighted ? "border-saffron-500 ring-1 ring-saffron-300" : "border-ink-200"
      }`}
    >
      <span
        aria-hidden={!clause.clauseNumber}
        className="flex h-7 min-w-[28px] items-center justify-center rounded-md bg-paper-200 px-1 text-xs font-semibold tabular-nums text-ink-600"
      >
        {clause.clauseNumber ? `#${clause.clauseNumber}` : "§"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-800">{humanizeLabel(clause.clauseType)}</p>
        {clause.text && (
          <p className="mt-1 line-clamp-2 font-serif text-[13px] leading-relaxed text-ink-500">
            {clause.text.trim()}
          </p>
        )}
        <div className="mt-1.5">
          <EvidenceButton clauseIds={[clause.id]} />
        </div>
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
    <div className="flex flex-col gap-2 p-4">
      {ruleBased.map((clause) => (
        <ClauseCard key={clause.id} clause={clause} highlighted={clause.id === highlightId} />
      ))}
    </div>
  );
}
