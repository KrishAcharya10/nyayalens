import { useEffect, useRef } from "react";
import type { Entity } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { EvidenceButton } from "./EvidenceButton";
import { humanizeLabel } from "@/lib/format";

// Exported so GraphView's node-click detail (Section 18: "opens its
// detail in the same intelligence panel used elsewhere") can render the
// exact same card a graph ENTITY node represents, rather than a second,
// inconsistent detail view.
export function EntityCard({
  entity,
  highlighted = false,
  mentionIds,
}: {
  entity: Entity;
  highlighted?: boolean;
  /** Every mention of the same value; "View" highlights all of them. */
  mentionIds?: string[];
}) {
  const ids = mentionIds ?? [entity.id];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 transition-colors ${
        highlighted ? "bg-saffron-100 ring-1 ring-saffron-300" : "hover:bg-paper-100"
      }`}
    >
      <p className="min-w-0 break-words text-sm text-ink-800">{entity.text ?? "—"}</p>
      <div className="flex shrink-0 items-center gap-2">
        {entity.confidence !== null && (
          <span className="text-meta tabular-nums text-ink-300">
            {Math.round(entity.confidence * 100)}%
          </span>
        )}
        {ids.length > 1 && (
          <span className="rounded-full bg-paper-200 px-1.5 text-[10px] text-ink-500">
            {ids.length} mentions
          </span>
        )}
        <EvidenceButton entityIds={ids} label="View" />
      </div>
    </div>
  );
}

// Section 15: rule_based entities are the default, reliable view. Other
// model sources, if ever passed in, are visually distinguished and never
// implied to be as reliable - generic_transformer's own vocabulary never
// matches this ontology and fine_tuned currently persists no entities at
// all (see docs/architecture/evaluation_results.md), so in practice this
// tab only ever has rule_based data to show.
export function EntityTab({
  entities,
  highlightId,
}: {
  entities: Entity[];
  highlightId?: string | null;
}) {
  const ruleBased = entities.filter((e) => e.modelSource === "RULE_BASED");
  const other = entities.filter((e) => e.modelSource !== "RULE_BASED");

  if (ruleBased.length === 0 && other.length === 0) {
    return <EmptyState title="No entities were extracted." />;
  }

  // Grouped by label, in document order of each label's first mention.
  // Within a label, repeated mentions of the same value are one row.
  const groups = new Map<string, Map<string, Entity[]>>();
  for (const e of [...ruleBased].sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0))) {
    const byValue = groups.get(e.label) ?? new Map<string, Entity[]>();
    const key = (e.text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    byValue.set(key, [...(byValue.get(key) ?? []), e]);
    groups.set(e.label, byValue);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="rounded-lg border border-ink-200 bg-paper-50">
          <h3 className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-xs font-semibold text-ink-600">
            {humanizeLabel(label)}
            <span className="rounded-full bg-paper-200 px-1.5 text-[10px] font-medium text-ink-500">
              {items.size}
            </span>
          </h3>
          <div className="flex flex-col p-1">
            {[...items.values()].map((mentions) => (
              <EntityCard
                key={mentions[0]!.id}
                entity={mentions[0]!}
                mentionIds={mentions.map((m) => m.id)}
                highlighted={mentions.some((m) => m.id === highlightId)}
              />
            ))}
          </div>
        </section>
      ))}
      {other.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-meta text-ink-400">
            Other model sources (experimental - not shown with the same confidence as rule-based
            results)
          </p>
          {other.map((entity) => (
            <div
              key={entity.id}
              className="mb-1 flex items-center gap-2 rounded border border-dashed border-ink-200 p-2"
            >
              <Badge tone="neutral">
                {entity.modelSource === "GENERIC_TRANSFORMER"
                  ? "Generic transformer"
                  : "Fine-tuned"}
              </Badge>
              <span className="text-sm text-ink-500">
                {humanizeLabel(entity.label)}: {entity.text ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
