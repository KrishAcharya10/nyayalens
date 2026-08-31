"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// The shared "scroll to this evidence" channel every evidence-navigation
// action (risk -> source, entity -> source, clause -> source, RAG source
// -> source) goes through, so the document viewer only has to listen in
// one place. For a Pass 2 risk finding, `clauseIds`/`entityIds` can carry
// MULTIPLE ids at once - the viewer must highlight every one of them, not
// just the first (Section 12's specific, testable requirement).
export interface EvidenceFocusTarget {
  clauseIds: string[];
  entityIds: string[];
  // Incremented on every focus() call so re-clicking the same evidence
  // still re-triggers the scroll + flash, even though the id set didn't change.
  requestId: number;
}

const EMPTY_TARGET: EvidenceFocusTarget = { clauseIds: [], entityIds: [], requestId: 0 };

interface EvidenceFocusContextValue {
  target: EvidenceFocusTarget;
  focusEvidence(clauseIds: string[], entityIds: string[]): void;
}

const EvidenceFocusContext = createContext<EvidenceFocusContextValue | null>(null);

export function EvidenceFocusProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EvidenceFocusTarget>(EMPTY_TARGET);

  const focusEvidence = useCallback((clauseIds: string[], entityIds: string[]) => {
    setTarget((prev) => ({ clauseIds, entityIds, requestId: prev.requestId + 1 }));
  }, []);

  const value = useMemo(() => ({ target, focusEvidence }), [target, focusEvidence]);

  return <EvidenceFocusContext.Provider value={value}>{children}</EvidenceFocusContext.Provider>;
}

export function useEvidenceFocus(): EvidenceFocusContextValue {
  const ctx = useContext(EvidenceFocusContext);
  if (!ctx) throw new Error("useEvidenceFocus must be used within an EvidenceFocusProvider");
  return ctx;
}
