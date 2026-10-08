import type { AskSource } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { humanizeLabel } from "@/lib/format";
import { EvidenceButton } from "./EvidenceButton";

// Section 22: sources read as citations, not raw metadata dumps - each
// one carries its excerpt, whether it came from a numbered clause or a
// document-level entity (chunkType, from the Phase 7A addendum), and a
// real evidence-navigation action.
export function AskSourcesList({ sources }: { sources: AskSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {sources.map((source) => (
        <li key={source.chunkId} className="rounded border border-ink-100 bg-paper-100 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              {source.chunkType === "clause" ? "Clause" : "Document detail"}
            </Badge>
            {source.clauseType && (
              <span className="text-xs text-ink-500">
                {source.clauseNumber ? `Clause ${source.clauseNumber} - ` : ""}
                {humanizeLabel(source.clauseType)}
              </span>
            )}
            {source.page != null && (
              <span className="text-xs text-ink-400">Page {source.page}</span>
            )}
          </div>
          <p className="mt-1 text-evidence italic text-ink-500">&ldquo;{source.excerpt}&rdquo;</p>
          <div className="mt-1">
            <EvidenceButton
              clauseIds={
                source.chunkType === "clause"
                  ? [source.chunkId]
                  : source.clauseId
                    ? [source.clauseId]
                    : []
              }
              entityIds={source.chunkType === "entity" ? [source.chunkId] : []}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
