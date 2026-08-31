"use client";

import { useMemo, useState } from "react";
import type { DocumentClause, Entity } from "@/lib/apiTypes";
import { useEvidenceFocus } from "./EvidenceFocusContext";
import { humanizeLabel } from "@/lib/format";

interface SearchHit {
  kind: "clause" | "entity";
  id: string;
  label: string;
  excerpt: string;
}

// Section 24: document-level search over clause text and entity values -
// no cross-document search in this phase. Results navigate to the real
// clause/entity location via the same evidence-focus channel every other
// evidence action uses.
export function DocumentSearch({
  clauses,
  entities,
}: {
  clauses: DocumentClause[];
  entities: Entity[];
}) {
  const [query, setQuery] = useState("");
  const { focusEvidence } = useEvidenceFocus();

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const clauseHits: SearchHit[] = clauses
      .filter(
        (c) =>
          c.modelSource === "RULE_BASED" &&
          (c.text?.toLowerCase().includes(q) || c.clauseType.toLowerCase().includes(q)),
      )
      .map((c) => ({
        kind: "clause",
        id: c.id,
        label: humanizeLabel(c.clauseType),
        excerpt: c.text?.trim().slice(0, 90) ?? "",
      }));
    const entityHits: SearchHit[] = entities
      .filter(
        (e) =>
          e.modelSource === "RULE_BASED" &&
          (e.text?.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)),
      )
      .map((e) => ({
        kind: "entity",
        id: e.id,
        label: humanizeLabel(e.label),
        excerpt: e.text ?? "",
      }));
    return [...entityHits, ...clauseHits].slice(0, 20);
  }, [query, clauses, entities]);

  return (
    <div className="border-b border-ink-100 p-2">
      <label htmlFor="doc-search" className="sr-only">
        Search this document
      </label>
      <input
        id="doc-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this document..."
        className="w-full rounded border border-ink-200 bg-paper-50 px-2 py-1.5 text-xs text-ink-700 focus-visible:border-saffron-500"
      />
      {query.trim().length >= 2 && (
        <ul className="mt-1.5 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {hits.length === 0 ? (
            <li className="px-1 py-2 text-xs text-ink-400">No matches in this document.</li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  onClick={() =>
                    focusEvidence(
                      hit.kind === "clause" ? [hit.id] : [],
                      hit.kind === "entity" ? [hit.id] : [],
                    )
                  }
                  className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-paper-200"
                >
                  <span className="font-medium text-ink-600">{hit.label}</span>{" "}
                  <span className="text-ink-400">{hit.excerpt}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
