"use client";

import { useState } from "react";
import type { DiffStatus, DocumentComparison } from "@/lib/apiTypes";
import { Badge, type Tone } from "@/components/ui/Badge";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";

const STATUS_TONE: Record<DiffStatus, Tone> = {
  SAME: "neutral",
  CHANGED: "review",
  ADDED: "info",
  REMOVED: "risk",
};
const STATUS_LABEL: Record<DiffStatus, string> = {
  SAME: "Same",
  CHANGED: "Changed",
  ADDED: "Only in B",
  REMOVED: "Only in A",
};

function StatusBadge({ status }: { status: DiffStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const dash = <span className="text-ink-300">-</span>;
const inr = (n: number | null | undefined) =>
  n == null ? null : `INR ${n.toLocaleString("en-IN")}`;

// Phase 8 document comparison: two of the caller's documents side by side -
// key terms on their normalized values (so "Rs. 25,000" and "INR 25000"
// are the same rent), clauses, obligations and risk findings. Differences
// first; identical items can be shown on demand.
export function ComparisonView({ comparison }: { comparison: DocumentComparison }) {
  const [showSame, setShowSame] = useState(false);
  const visible = <T extends { status: DiffStatus }>(items: T[]) =>
    showSame ? items : items.filter((i) => i.status !== "SAME");
  const { summary } = comparison;

  return (
    <div className="flex flex-col gap-5" data-testid="comparison">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="review">{summary.CHANGED} changed</Badge>
        <Badge tone="risk">{summary.REMOVED} only in A</Badge>
        <Badge tone="info">{summary.ADDED} only in B</Badge>
        <Badge tone="neutral">{summary.SAME} same</Badge>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-500">
          <input
            type="checkbox"
            checked={showSame}
            onChange={(e) => setShowSame(e.target.checked)}
          />
          Show identical items
        </label>
      </div>
      {!comparison.sameDomain && (
        <PermanentNotice>
          These documents belong to different domains ({humanizeLabel(comparison.a.domain)} and{" "}
          {humanizeLabel(comparison.b.domain)}), so most terms appear on one side only.
        </PermanentNotice>
      )}

      <section>
        <h2 className="text-section-title text-ink-600">Key terms</h2>
        {visible(comparison.fields).length === 0 ? (
          <p className="mt-1 text-sm text-ink-400">No differences in extracted terms.</p>
        ) : (
          <table className="mt-2 w-full table-fixed text-left text-sm">
            <thead className="text-xs text-ink-400">
              <tr>
                <th className="w-1/4 py-1 font-normal">Term</th>
                <th className="py-1 font-normal">Document A</th>
                <th className="py-1 font-normal">Document B</th>
                <th className="w-24 py-1 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible(comparison.fields).map((f) => (
                <tr key={f.label} className="border-t border-ink-100 align-top">
                  <td className="py-1.5 pr-2 text-ink-500">{f.displayName}</td>
                  <td className="break-words py-1.5 pr-2 text-ink-700">
                    {f.a.length ? (
                      <span className="line-clamp-3" title={f.a.map((v) => v.text).join(", ")}>
                        {f.a.map((v) => v.text).join(", ")}
                      </span>
                    ) : (
                      dash
                    )}
                  </td>
                  <td className="break-words py-1.5 pr-2 text-ink-700">
                    {f.b.length ? (
                      <span className="line-clamp-3" title={f.b.map((v) => v.text).join(", ")}>
                        {f.b.map((v) => v.text).join(", ")}
                      </span>
                    ) : (
                      dash
                    )}
                  </td>
                  <td className="py-1.5">
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-section-title text-ink-600">Obligations</h2>
        {visible(comparison.obligations).length === 0 ? (
          <p className="mt-1 text-sm text-ink-400">No differences in obligations.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible(comparison.obligations).map((o) => (
              <li
                key={`${o.actorLabel}:${o.action}`}
                className="rounded border border-ink-100 bg-paper-50 p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-ink-700">
                    {humanizeLabel(o.actorLabel)} must {humanizeLabel(o.action).toLowerCase()}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                {o.status === "CHANGED" && (
                  <p className="mt-1 text-xs text-ink-500">
                    A: {inr(o.a?.amountInr) ?? o.a?.deadlineText ?? "-"} / B:{" "}
                    {inr(o.b?.amountInr) ?? o.b?.deadlineText ?? "-"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-section-title text-ink-600">Relations</h2>
        {visible(comparison.relations).length === 0 ? (
          <p className="mt-1 text-sm text-ink-400">No differences in relations.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible(comparison.relations).map((r) => (
              <li
                key={`${r.subjectLabel}|${r.relationType}|${r.objectLabel}`}
                className="flex flex-wrap items-center gap-2 rounded border border-ink-100 bg-paper-50 p-2 text-sm"
              >
                <span className="text-ink-700">
                  {humanizeLabel(r.subjectLabel)} {humanizeLabel(r.relationType).toLowerCase()}{" "}
                  {humanizeLabel(r.objectLabel).toLowerCase()}
                </span>
                <StatusBadge status={r.status} />
                {r.status === "CHANGED" && (
                  <span className="text-xs text-ink-500">
                    {r.a.join(", ")} &rarr; {r.b.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-section-title text-ink-600">Clauses</h2>
        {visible(comparison.clauses).length === 0 ? (
          <p className="mt-1 text-sm text-ink-400">Both documents have the same clauses.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {visible(comparison.clauses).map((c) => (
              <li
                key={c.clauseType}
                className="flex items-center gap-1.5 rounded border border-ink-100 bg-paper-50 px-2 py-1 text-sm"
              >
                <span className="text-ink-700">{humanizeLabel(c.clauseType)}</span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-section-title text-ink-600">Potential issues</h2>
        {visible(comparison.risks).length === 0 ? (
          <p className="mt-1 text-sm text-ink-400">
            The same issue categories are flagged in both.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible(comparison.risks).map((r) => (
              <li
                key={r.category}
                className="rounded border border-ink-100 bg-paper-50 p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-ink-700">{humanizeLabel(r.category)}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-xs text-ink-500">{(r.a ?? r.b)?.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
