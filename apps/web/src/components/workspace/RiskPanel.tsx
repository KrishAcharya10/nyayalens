import { useEffect, useRef } from "react";
import type { Risk, RiskSeverity } from "@/lib/apiTypes";
import { Badge, type Tone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { EvidenceButton } from "./EvidenceButton";
import { useEvaluationStats, formatPercent } from "@/lib/useEvaluationStats";
import { humanizeLabel } from "@/lib/format";

const SEVERITY_ORDER: RiskSeverity[] = ["HIGH", "MEDIUM", "LOW"];
const SEVERITY_TONE: Record<RiskSeverity, Tone> = { HIGH: "risk", MEDIUM: "review", LOW: "info" };
const SEVERITY_EDGE: Record<RiskSeverity, string> = {
  HIGH: "border-l-risk-strong",
  MEDIUM: "border-l-review-strong",
  LOW: "border-l-info-strong",
};

function evidenceIds(risk: Risk): { clauseIds: string[]; entityIds: string[] } {
  const clauseIds = risk.evidence
    .filter((e) => e.sourceTable === "document_clauses")
    .map((e) => e.sourceId);
  const entityIds = risk.evidence
    .filter((e) => e.sourceTable === "entities")
    .map((e) => e.sourceId);
  return { clauseIds, entityIds };
}

export function RiskCard({ risk, highlighted = false }: { risk: Risk; highlighted?: boolean }) {
  const { clauseIds, entityIds } = evidenceIds(risk);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={`rounded-lg border border-l-4 bg-paper-50 p-3 shadow-subtle transition-colors ${
        SEVERITY_EDGE[risk.severity]
      } ${highlighted ? "border-saffron-500 ring-1 ring-saffron-300" : "border-ink-200"}`}
    >
      <p className="text-sm font-semibold text-ink-800">{humanizeLabel(risk.category)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={SEVERITY_TONE[risk.severity]}>{risk.severity}</Badge>
        {risk.pass === "PASS_2" && <Badge tone="neutral">Cross-clause</Badge>}
        {risk.pass === "CONSISTENCY" && <Badge tone="neutral">Consistency</Badge>}
        {risk.reviewRequired && <Badge tone="review">Review required</Badge>}
      </div>
      {/* risk.reason is rendered byte-for-byte from the backend - never
          rewritten, strengthened, or summarized. The backend's own
          non-definitive framing (see reasonFraming.ts) is the only
          framing this UI ever shows. */}
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{risk.reason}</p>
      <div className="mt-2">
        <EvidenceButton
          clauseIds={clauseIds}
          entityIds={entityIds}
          label={
            clauseIds.length + entityIds.length > 1
              ? "View all evidence in document"
              : "View in document"
          }
        />
      </div>
    </div>
  );
}

export function RiskPanel({ risks, highlightId }: { risks: Risk[]; highlightId?: string | null }) {
  const stats = useEvaluationStats();
  const ruleBased = risks.filter((r) => r.modelSource === "RULE_BASED");

  const detectionRates =
    stats?.adversarial?.categories
      .map((c) => c.detectionRate)
      .filter((r): r is number => r !== null) ?? [];
  const avgControlFp =
    stats?.adversarial?.categories
      .map((c) => c.controlFalsePositiveRate)
      .filter((r): r is number => r !== null) ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      {ruleBased.length > 0 && (
        <div className="grid grid-cols-3 gap-2" aria-label="Findings by severity">
          {SEVERITY_ORDER.map((sev) => (
            <div
              key={sev}
              className={`rounded-md border border-l-4 border-ink-200 bg-paper-50 px-3 py-2 ${SEVERITY_EDGE[sev]}`}
            >
              <p className="text-lg font-semibold tabular-nums text-ink-800">
                {ruleBased.filter((r) => r.severity === sev).length}
              </p>
              <p className="text-[11px] text-ink-400">
                {sev.charAt(0) + sev.slice(1).toLowerCase()}
              </p>
            </div>
          ))}
        </div>
      )}
      {/* Section 17: permanent, always-visible, never dismissible. */}
      <PermanentNotice>
        Risk findings identify provisions that may warrant review. They are not legal conclusions or
        legal advice.
      </PermanentNotice>

      {ruleBased.length === 0 ? (
        <EmptyState title="No potential issues flagged in this document." />
      ) : (
        SEVERITY_ORDER.map((severity) => {
          const group = ruleBased.filter((r) => r.severity === severity);
          if (group.length === 0) return null;
          return (
            <div key={severity}>
              <p className="mb-1.5 text-section-title text-ink-500">
                {severity === "HIGH"
                  ? "High severity"
                  : severity === "MEDIUM"
                    ? "Medium severity"
                    : "Low severity"}{" "}
                ({group.length})
              </p>
              <div className="flex flex-col gap-2">
                {group.map((risk) => (
                  <RiskCard key={risk.id} risk={risk} highlighted={risk.id === highlightId} />
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Section 17: permanent research-limitation note, sourced from the
          actual current adversarial evaluation numbers - never a headline
          "100% accurate" claim, always with the caveat immediately
          adjacent, regardless of what the number is. */}
      <PermanentNotice tone="info">
        <p className="font-medium text-info-strong">About this risk analysis</p>
        <p className="mt-1">
          {detectionRates.length > 0 ? (
            <>
              In a controlled adversarial benchmark ({stats?.adversarial?.totalDocuments} synthetic
              test documents), this detector correctly flagged{" "}
              {formatPercent(Math.min(...detectionRates))}
              {new Set(detectionRates).size > 1
                ? `–${formatPercent(Math.max(...detectionRates))}`
                : ""}{" "}
              of injected test cases per category
              {avgControlFp.length > 0 && (
                <>
                  {" "}
                  and flagged {formatPercent(Math.max(...avgControlFp))} or fewer matched control
                  documents that had no injected issue
                </>
              )}
              .{" "}
            </>
          ) : null}
          This measures controlled robustness on a benchmark designed by the same process that built
          the detector - it is not a guarantee of accuracy on real, unseen legal documents. No claim
          of real-world accuracy is made here.
        </p>
      </PermanentNotice>
    </div>
  );
}
