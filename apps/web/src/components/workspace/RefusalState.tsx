// Section 21: grounded: false must be visually and structurally distinct
// from a low-confidence answer, never styled as a normal answer card. No
// invented answer text, ever - this is the only thing ever shown when
// the backend refuses.
export function RefusalState() {
  return (
    <div
      role="status"
      data-testid="refusal-state"
      className="rounded border border-dashed border-ink-300 bg-paper-100 p-3 text-sm text-ink-500"
    >
      <p className="font-medium text-ink-600">Not enough evidence found</p>
      <p className="mt-1">I couldn&apos;t find enough evidence in this document to answer that.</p>
    </div>
  );
}
