"use client";

import type { ReactNode } from "react";

interface TabDef {
  id: string;
  label: string;
  count?: number;
}

// A plain, accessible tablist (Section 13's segmented intelligence-panel
// sections) - real ARIA tab semantics, not styled buttons with no
// relationship to their panel, so keyboard/screen-reader users get the
// same structure as everyone else (Section 26).
export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Intelligence panel sections"
      className="flex shrink-0 flex-wrap gap-x-0.5 border-b border-ink-200 px-2"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors ${
              active ? "text-ink-800" : "text-ink-400 hover:text-ink-600"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className={`ml-1 ${active ? "text-ink-500" : "text-ink-300"}`}>
                {tab.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-saffron-500" />
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
      className="flex-1 overflow-y-auto"
    >
      {children}
    </div>
  );
}
