// Section 0 + Section 20: mandatory, permanent, non-dismissible - appears
// on EVERY grounded answer, unconditionally, with no prop that could hide
// it and no numeric confidence score. This is not a judgment call the
// component makes per-answer; it is a fixed piece of UI that always
// renders identically, because the backend has no reliable per-answer
// reliability signal to vary it by (see rag_evaluation_results.md's
// refusal-correctness investigation - should-ground and should-refuse
// score ranges were shown to overlap completely, down to an exact tie).
//
// Phase 8: a structured answer (a value read from the document's extracted
// facts) gets wording that says exactly that - still no confidence score.
export function EvidenceStatusIndicator({
  method = "retrieval",
}: {
  method?: "structured" | "retrieval" | undefined;
}) {
  if (method === "structured") {
    return (
      <p
        role="note"
        data-testid="evidence-status-indicator"
        className="mt-2 text-xs leading-relaxed text-ink-500"
      >
        <span className="font-medium text-ink-600">Evidence status: Grounded. </span>
        This value was extracted from the exact text shown below. Extraction can miss or misread a
        value - check the source span yourself before relying on it.
      </p>
    );
  }
  return (
    <p
      role="note"
      data-testid="evidence-status-indicator"
      className="mt-2 text-xs leading-relaxed text-ink-500"
    >
      <span className="font-medium text-ink-600">Evidence status: </span>
      Supporting text was found in this document and is shown below. A retrieved passage being
      topically related does not guarantee it fully and correctly answers your question - check the
      source excerpt yourself before relying on this answer.
    </p>
  );
}
