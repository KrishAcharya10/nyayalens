"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A modal dialog with the behaviour keyboard and screen-reader users expect:
// focus moves into it when it opens, Tab and Shift+Tab stay inside it, Escape
// closes it, and focus returns to whatever opened it. The backdrop click also
// closes it. Content is rendered only while `open`.
export function Dialog({
  open,
  onClose,
  label,
  labelledBy,
  className = "",
  backdropClassName = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name when there is no visible title (otherwise use labelledBy). */
  label?: string;
  labelledBy?: string;
  className?: string;
  backdropClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Prefer an element that asks for focus, else the first control, else the panel.
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 ${backdropClassName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(label ? { "aria-label": label } : {})}
        {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
        tabIndex={-1}
        className={`outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
