import type { Obligation } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";
import { EvidenceButton } from "./EvidenceButton";

function formatInr(amount: number): string {
  return `INR ${amount.toLocaleString("en-IN")}`;
}

// Phase 8: who must do what - ACTOR must ACTION, with the amount, deadline,
// frequency and condition the sentence states, and the sentence itself as
// evidence. An actor the domain does not normally expect for the action
// (e.g. the employer "shall serve notice of resignation") is flagged for
// review, not silently corrected.
export function ObligationsTab({ obligations }: { obligations: Obligation[] }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <PermanentNotice>
        Obligations are extracted from sentences such as &ldquo;The Buyer shall pay...&rdquo;. They
        summarise what the document says; they are not legal advice about enforceability.
      </PermanentNotice>
      {obligations.length === 0 ? (
        <EmptyState title="No obligations were extracted from this document." />
      ) : (
        <ul className="flex flex-col gap-2">
          {obligations.map((o) => (
            <li
              key={`${o.textStart}-${o.action}-${o.actorLabel}`}
              className="rounded border border-ink-100 bg-paper-50 p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{humanizeLabel(o.actorLabel)}</Badge>
                <span className="text-sm text-ink-500">must</span>
                <Badge tone="info">{humanizeLabel(o.action)}</Badge>
                {o.unexpectedActor && <Badge tone="review">Review required: unusual actor</Badge>}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {o.amountInr !== null && (
                  <>
                    <dt className="text-ink-400">Amount</dt>
                    <dd className="text-ink-700">{formatInr(o.amountInr)}</dd>
                  </>
                )}
                {o.deadlineText && (
                  <>
                    <dt className="text-ink-400">Deadline</dt>
                    <dd className="text-ink-700">{o.deadlineText}</dd>
                  </>
                )}
                {o.frequency && (
                  <>
                    <dt className="text-ink-400">Frequency</dt>
                    <dd className="text-ink-700">{humanizeLabel(o.frequency)}</dd>
                  </>
                )}
                {o.condition && (
                  <>
                    <dt className="text-ink-400">Condition</dt>
                    <dd className="text-ink-700">{o.condition}</dd>
                  </>
                )}
              </dl>
              <p className="mt-2 text-evidence italic text-ink-500">
                &ldquo;{o.evidenceText}&rdquo;
              </p>
              <div className="mt-1">
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
      )}
    </div>
  );
}
