"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DocumentClause, Entity } from "@/lib/apiTypes";
import { buildSegments, groupSegmentsByClause } from "@/lib/spans";
import { useEvidenceFocus } from "./EvidenceFocusContext";
import { EmptyState } from "@/components/ui/States";

// Renders canonical_text with clause blocks (Section 10: subtle
// background/side marker) and entity spans (subtle underline) nested
// correctly via spans.ts's overlap-safe segmentation - never re-slicing
// or duplicating the source text. Only rule_based-sourced clauses/entities
// are shown by default (Section 10's model_source discipline); the
// workspace only ever passes this component rule_based data today.
export function DocumentViewer({
  canonicalText,
  clauses,
  entities,
}: {
  canonicalText: string | null;
  clauses: DocumentClause[];
  entities: Entity[];
}) {
  const { target } = useEvidenceFocus();
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => {
    if (!canonicalText) return [];
    const segments = buildSegments(canonicalText, clauses, entities);
    return groupSegmentsByClause(segments);
  }, [canonicalText, clauses, entities]);

  useEffect(() => {
    if (target.requestId === 0) return;
    const ids = [
      ...target.clauseIds.map((id) => `clause-${id}`),
      ...target.entityIds.map((id) => `entity-${id}`),
    ];
    if (ids.length === 0) return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    elements[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    for (const el of elements) {
      el.classList.remove("animate-flash-highlight");
      // Force a reflow so re-adding the class restarts the CSS animation
      // even when the same element was already the focus target.
      void el.offsetWidth;
      el.classList.add("animate-flash-highlight");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on requestId only, by design (see EvidenceFocusContext)
  }, [target.requestId]);

  if (!canonicalText) {
    return (
      <EmptyState
        title="Document text not yet available"
        hint="Extraction may still be in progress, or this document has no extractable text."
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="prose-measure mx-auto whitespace-pre-wrap px-8 py-8 font-serif text-[15px] leading-7 text-ink-800"
    >
      {blocks.map((block, blockIndex) => {
        const content = block.segments.map((segment, segmentIndex) => {
          const key = `${blockIndex}-${segmentIndex}`;
          if (segment.entities.length === 0) {
            return <span key={key}>{segment.text}</span>;
          }
          // Nested marks when >1 entity covers the exact same sub-range
          // (rare, defensive - see spans.test.ts) - innermost still gets
          // its own id so every entity remains individually focusable.
          return segment.entities.reduceRight<ReactNode>(
            (child, entity) => (
              <mark
                key={`${key}-${entity.id}`}
                id={`entity-${entity.id}`}
                title={entity.label}
                className="rounded-sm bg-transparent underline decoration-saffron-500 decoration-2 underline-offset-2"
              >
                {child}
              </mark>
            ),
            segment.text as ReactNode,
          );
        });

        if (!block.clause) {
          return <span key={blockIndex}>{content}</span>;
        }

        return (
          <div
            key={blockIndex}
            id={`clause-${block.clause.id}`}
            data-clause-type={block.clause.clauseType}
            className="my-1 rounded-r border-l-2 border-ink-200 bg-ink-50/40 py-1 pl-3 pr-1 transition-colors"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
