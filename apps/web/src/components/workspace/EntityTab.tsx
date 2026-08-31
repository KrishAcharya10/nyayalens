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
}: {
  entity: Entity;
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-clause-title text-ink-700">{humanizeLabel(entity.label)}</span>
        {entity.confidence !== null && (
          <span className="text-meta text-ink-400">{Math.round(entity.confidence * 100)}%</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-ink-800">{entity.text ?? "—"}</p>
      <div className="mt-1.5">
        <EvidenceButton entityIds={[entity.id]} />
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

  return (
    <div className="flex flex-col gap-1 p-3">
      {ruleBased.map((entity) => (
        <EntityCard key={entity.id} entity={entity} highlighted={entity.id === highlightId} />
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
