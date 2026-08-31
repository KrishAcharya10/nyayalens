import type { ReactNode } from "react";

// A permanent, non-dismissible informational note - no close button, no
// conditional rendering, no collapsed/expand-on-click state that could
// hide it. Used for the trust/evidence requirements in Sections 0, 17,
// 20, and 23 of the Phase 7B brief, which must appear on every relevant
// screen unconditionally. Plain semantic markup (not a tooltip, not an
// aria-live toast) so it reaches assistive technology exactly the same
// way it reaches a sighted user - present in the DOM on first render, not
// something a screen reader user has to trigger.
export function PermanentNotice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info";
  children: ReactNode;
}) {
  const toneClasses =
    tone === "info"
      ? "bg-info-bg border-info-border text-info-text"
      : "bg-paper-200 border-ink-200 text-ink-600";
  return (
    <div
      role="note"
      className={`rounded border px-2.5 py-2 text-xs leading-relaxed ${toneClasses}`}
    >
      {children}
    </div>
  );
}
