"use client";

import { useEvidenceFocus } from "./EvidenceFocusContext";

// The one control every evidence-bearing item (entity, clause, risk
// finding, RAG source) uses to jump to its real source location - never a
// fabricated one. For a Pass 2 risk finding this is called with BOTH
// compared spans' ids at once (Section 12) so every relevant span
// highlights together, not just the first.
export function EvidenceButton({
  clauseIds = [],
  entityIds = [],
  label = "View in document",
}: {
  clauseIds?: string[];
  entityIds?: string[];
  label?: string;
}) {
  const { focusEvidence } = useEvidenceFocus();
  const disabled = clauseIds.length === 0 && entityIds.length === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => focusEvidence(clauseIds, entityIds)}
      className="text-left text-xs font-medium text-info-strong hover:underline disabled:cursor-not-allowed disabled:text-ink-300 disabled:no-underline"
    >
      {disabled ? "No document location available" : label}
    </button>
  );
}
