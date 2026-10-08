import type { RiskFinding } from "./types.js";

/**
 * Drops a finding that repeats an earlier one: same category and at least
 * one shared evidence span (a v1 check and a Phase 8 generic check flagging
 * the same clause). Document-level findings (no evidence) are compared by
 * reason. Order is preserved, so the original (v1) finding is kept.
 */
export function dedupeFindings(findings: RiskFinding[]): RiskFinding[] {
  const kept: RiskFinding[] = [];
  for (const f of findings) {
    const ids = new Set(f.evidence.map((e) => e.sourceId));
    const duplicate = kept.some(
      (k) =>
        k.category === f.category &&
        (ids.size === 0
          ? k.evidence.length === 0 && k.reason === f.reason
          : k.evidence.some((e) => ids.has(e.sourceId))),
    );
    if (!duplicate) kept.push(f);
  }
  return kept;
}
