import type { ReactNode } from "react";

// The one place severity/category/model-source tones map to color -
// every consumer (RiskPanel, EntityTab, ...) uses this instead of picking
// its own color, so "risk = red family" stays consistent everywhere.
export type Tone = "risk" | "review" | "safe" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  risk: "bg-risk-bg text-risk-text border-risk-border",
  review: "bg-review-bg text-review-text border-review-border",
  safe: "bg-safe-bg text-safe-text border-safe-border",
  info: "bg-info-bg text-info-text border-info-border",
  neutral: "bg-ink-100 text-ink-600 border-ink-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-none ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
