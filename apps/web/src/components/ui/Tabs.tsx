"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

interface RailTabDef {
  id: string;
  label: string;
  icon: ReactNode;
  count?: number;
  /** Draws the count in the risk tone (e.g. open inconsistencies). */
  alert?: boolean;
}

// The workspace's section tabs: every section stays visible however many
// there are, each with an icon, a short label and an optional count. A
// vertical rail from tablet width up; a horizontally scrolling strip on a
// phone. Real ARIA tab semantics with the keyboard behaviour that goes with
// them: one tab stop (the selected tab), arrow keys move between tabs and
// select them, Home and End jump to the ends.
export function RailTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: RailTabDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const at = tabs.findIndex((t) => t.id === activeId);
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Intelligence panel sections"
      aria-orientation="vertical"
      className="order-first flex shrink-0 gap-1 overflow-x-auto border-b border-ink-200 bg-paper-100 px-1.5 py-1.5 md:order-last md:w-[76px] md:flex-col md:overflow-visible md:border-b-0 md:border-l md:py-2"
    >
      {tabs.map((tab, i) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
            className={`relative flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[10.5px] font-medium leading-none transition-colors md:min-w-0 ${
              active
                ? "bg-paper-50 text-ink-900 shadow-subtle ring-1 ring-ink-200"
                : "text-ink-500 hover:bg-paper-200 hover:text-ink-800"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-saffron-500 md:inset-x-auto md:inset-y-2 md:bottom-auto md:left-0 md:h-auto md:w-0.5"
              />
            )}
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === "number" && tab.count > 0 && (
              <span
                className={`absolute right-1 top-1 min-w-[16px] rounded-full px-1 py-0.5 text-[9px] tabular-nums ${
                  tab.alert ? "bg-risk-strong text-paper-50" : "bg-ink-200 text-ink-700"
                }`}
              >
                <span className="sr-only">, </span>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  activeId,
  children,
}: {
  id: string;
  activeId: string;
  children: ReactNode;
}) {
  if (id !== activeId) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {children}
    </div>
  );
}
