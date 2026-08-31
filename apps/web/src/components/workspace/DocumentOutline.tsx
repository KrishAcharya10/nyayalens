"use client";

import type { DocumentClause, DocumentDetail } from "@/lib/apiTypes";
import { useEvidenceFocus } from "./EvidenceFocusContext";
import { formatDocumentType } from "@/lib/format";

export function DocumentOutline({
  document,
  clauses,
}: {
  document: DocumentDetail;
  clauses: DocumentClause[];
}) {
  const { focusEvidence } = useEvidenceFocus();
  const ruleBased = clauses
    .filter((c) => c.modelSource === "RULE_BASED")
    .sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-100 p-3">
        <p className="truncate text-sm font-medium text-ink-800">{document.title}</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {formatDocumentType(document.documentType)} · {document.pages.length} page
          {document.pages.length === 1 ? "" : "s"}
        </p>
      </div>
      <nav aria-label="Document outline" className="flex-1 overflow-y-auto p-2">
        <p className="px-1.5 py-1 text-meta uppercase tracking-wide text-ink-400">Clauses</p>
        {ruleBased.length === 0 ? (
          <p className="px-1.5 py-1 text-xs text-ink-400">No clauses classified yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {ruleBased.map((clause) => (
              <li key={clause.id}>
                <button
                  type="button"
                  onClick={() => focusEvidence([clause.id], [])}
                  className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-xs text-ink-600 hover:bg-paper-200"
                >
                  {clause.clauseNumber && (
                    <span className="text-ink-400">{clause.clauseNumber}.</span>
                  )}
                  <span className="truncate">
                    {clause.clauseType
                      .toLowerCase()
                      .split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
