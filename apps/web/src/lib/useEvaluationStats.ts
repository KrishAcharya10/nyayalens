"use client";

import { useEffect, useState } from "react";

export interface EvaluationStats {
  rag: {
    retrievalHitRateAny: number;
    retrievalHitRateAll: number;
    groundedAnswerRate: number;
    citationCorrectnessRate: number | null;
    refusalCorrectnessRate: number;
  } | null;
  ragSecurity: { nCases: number; nPassed: number } | null;
  adversarial: {
    totalDocuments: number;
    categories: {
      category: string;
      detectionRate: number | null;
      controlFalsePositiveRate: number | null;
    }[];
  } | null;
  ordinaryControlFalsePositiveRate: number | null;
}

// Fetches /api/eval-stats (this Next app's own route handler, NOT the
// Express backend - see that route's comment) exactly once per session
// and caches it in module scope, since these numbers only change when
// someone re-runs an evaluation script, never during normal use.
let cache: Promise<EvaluationStats> | null = null;

function fetchStats(): Promise<EvaluationStats> {
  cache ??= fetch("/api/eval-stats").then((res) => res.json() as Promise<EvaluationStats>);
  return cache;
}

export function useEvaluationStats(): EvaluationStats | null {
  const [stats, setStats] = useState<EvaluationStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "not available";
  return `${Math.round(value * 100)}%`;
}
