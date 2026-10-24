import type { ReactNode } from "react";
import { Button } from "./Button";

// Section 28: proper empty/loading/error states everywhere data can be
// absent or pending - never a blank white area.
export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  /** A control that gets the user out of the empty state (a retry, a reset). */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-ink-400">{icon}</div>}
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {hint && <p className="max-w-xs text-xs text-ink-500">{hint}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 px-4 py-10 text-sm text-ink-400">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 animate-spin text-ink-400 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-medium text-risk-text">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
