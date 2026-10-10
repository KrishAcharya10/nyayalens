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

interface RailTabDef {
  id: string;
  label: string;
  icon: ReactNode;
  count?: number;
  /** Draws the count in the risk tone (e.g. open inconsistencies). */
  alert?: boolean;
}

// A vertical tab rail: every section stays visible however many there are
// (eight in the workspace), each with an icon, a short label and an
// optional count. Same ARIA tab semantics as Tabs, vertical orientation.
export function RailTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: RailTabDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Intelligence panel sections"
      aria-orientation="vertical"
      className="flex w-[76px] shrink-0 flex-col gap-1 border-l border-ink-200 bg-paper-100 px-1.5 py-2"
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
            className={`relative flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10.5px] font-medium leading-none transition-colors ${
              active
                ? "bg-paper-50 text-ink-900 shadow-subtle ring-1 ring-ink-200"
                : "text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-saffron-500"
              />
            )}
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === "number" && tab.count > 0 && (
              <span
                className={`absolute right-1 top-1 min-w-[16px] rounded-full px-1 py-0.5 text-[9px] tabular-nums ${
                  tab.alert ? "bg-risk-strong text-paper-50" : "bg-ink-200 text-ink-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
