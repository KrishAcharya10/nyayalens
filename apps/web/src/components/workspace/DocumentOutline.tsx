"use client";

import type { DocumentClause } from "@/lib/apiTypes";
import { useEvidenceFocus } from "./EvidenceFocusContext";
import { humanizeLabel } from "@/lib/format";

// The document's contents; its title and type live in the workspace header.
export function DocumentOutline({ clauses }: { clauses: DocumentClause[] }) {
  const { focusEvidence } = useEvidenceFocus();
  const ruleBased = clauses
    .filter((c) => c.modelSource === "RULE_BASED")
    .sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));

  return (
    <nav aria-label="Document outline" className="flex-1 overflow-y-auto p-2">
      <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        Contents
      </p>
      {ruleBased.length === 0 ? (
        <p className="px-2 py-1 text-xs text-ink-400">No clauses classified yet.</p>
      ) : (
        <ul className="flex flex-col">
          {ruleBased.map((clause) => (
            <li key={clause.id}>
              <button
                type="button"
                onClick={() => focusEvidence([clause.id], [])}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-xs text-ink-600 hover:bg-paper-200 hover:text-ink-900"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-ink-400">
                  {clause.clauseNumber ?? "§"}
                </span>
                <span className="truncate">{humanizeLabel(clause.clauseType)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
