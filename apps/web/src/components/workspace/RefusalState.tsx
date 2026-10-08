// Section 21: grounded: false must be visually and structurally distinct
// from a low-confidence answer, never styled as a normal answer card. No
// invented answer text, ever - this is the only thing ever shown when
// the backend refuses.
//
// Phase 8: when the structured path explains WHY there is no answer (the
// field belongs to a different kind of document, or no such value was
// extracted), that backend sentence is shown verbatim as `detail`.
export function RefusalState({ detail }: { detail?: string | undefined }) {
  return (
    <div
      role="status"
      data-testid="refusal-state"
      className="rounded border border-dashed border-ink-300 bg-paper-100 p-3 text-sm text-ink-500"
    >
      <p className="font-medium text-ink-600">Not enough evidence found</p>
      <p className="mt-1">I couldn&apos;t find enough evidence in this document to answer that.</p>
      {detail && <p className="mt-1 text-xs text-ink-400">{detail}</p>}
    </div>
  );
}
