import { useMemo, useState } from "react";
import type { Obligation } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/States";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";
import { EvidenceButton } from "./EvidenceButton";

function formatInr(amount: number): string {
  return `INR ${amount.toLocaleString("en-IN")}`;
}

function Chip({ icon, children }: { icon: "calendar" | "clock" | "alert"; children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-paper-100 px-2 py-0.5 text-xs text-ink-600">
      <Icon name={icon} size={12} className="text-ink-400" />
      {children}
    </span>
  );
}

// Phase 8: who must do what - ACTOR must ACTION, with the amount, deadline,
// frequency and condition the sentence states, and the sentence itself as
// evidence. An actor the domain does not normally expect for the action
// (e.g. the employer "shall serve notice of resignation") is flagged for
// review, not silently corrected. Filter chips narrow the list to one party.
export function ObligationsTab({ obligations }: { obligations: Obligation[] }) {
  const [actor, setActor] = useState<string | null>(null);
  const actors = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of obligations) m.set(o.actorLabel, (m.get(o.actorLabel) ?? 0) + 1);
    return [...m.entries()];
  }, [obligations]);
  const shown = actor ? obligations.filter((o) => o.actorLabel === actor) : obligations;

  return (
    <div className="flex flex-col gap-3 p-4">
      <PermanentNotice>
        Obligations are extracted from sentences such as &ldquo;The Buyer shall pay...&rdquo;. They
        summarise what the document says; they are not legal advice about enforceability.
      </PermanentNotice>
      {obligations.length === 0 ? (
        <EmptyState title="No obligations were extracted from this document." />
      ) : (
        <>
          {actors.length > 1 && (
            <div role="group" aria-label="Filter by party" className="flex flex-wrap gap-1.5">
              {[[null, obligations.length] as const, ...actors].map(([id, n]) => {
                const active = actor === id;
                return (
                  <button
                    key={id ?? "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActor(id)}
                    className={`h-7 rounded-full border px-2.5 text-xs transition-colors ${
                      active
                        ? "border-ink-800 bg-ink-800 text-paper-50"
                        : "border-ink-200 bg-paper-50 text-ink-600 hover:bg-paper-200"
                    }`}
                  >
                    {id ? `${humanizeLabel(id)} (${n})` : `All (${n})`}
                  </button>
                );
              })}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {shown.map((o) => (
              <li
                key={`${o.textStart}-${o.action}-${o.actorLabel}`}
                className="rounded-lg border border-ink-200 bg-paper-50 p-3 shadow-subtle"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{humanizeLabel(o.actorLabel)}</Badge>
                  <span className="text-xs text-ink-400">must</span>
                  <Badge tone="info">{humanizeLabel(o.action)}</Badge>
                  {o.unexpectedActor && <Badge tone="review">Review required: unusual actor</Badge>}
                </div>
                {o.amountInr !== null && (
                  <p className="mt-2 text-lg font-semibold tabular-nums text-ink-900">
                    {formatInr(o.amountInr)}
                  </p>
                )}
                {(o.deadlineText || o.frequency || o.condition) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.deadlineText && <Chip icon="calendar">{o.deadlineText}</Chip>}
                    {o.frequency && <Chip icon="clock">{humanizeLabel(o.frequency)}</Chip>}
                    {o.condition && <Chip icon="alert">{o.condition}</Chip>}
                  </div>
                )}
                <div className="mt-2 flex items-start justify-between gap-3 border-t border-ink-100 pt-2">
                  <details className="group min-w-0 flex-1">
                    <summary className="cursor-pointer list-none text-xs text-ink-400 hover:text-ink-600">
                      <span className="group-open:hidden">Show the sentence</span>
                      <span className="hidden group-open:inline">Hide the sentence</span>
                    </summary>
                    <p className="mt-1.5 border-l-2 border-ink-200 pl-2.5 font-serif text-[13px] italic leading-relaxed text-ink-600">
                      &ldquo;{o.evidenceText}&rdquo;
                    </p>
                  </details>
                  <EvidenceButton
                    clauseIds={o.sourceClauseId ? [o.sourceClauseId] : []}
                    entityIds={[o.actorEntityId, o.amountEntityId].filter(
                      (id): id is string => id !== null,
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
