import type { Risk } from "@/lib/apiTypes";
import { EmptyState } from "@/components/ui/States";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { RiskCard } from "./RiskPanel";

// Phase 8: the consistency engine's findings - the same value stated
// differently in two places (a consideration of Rs. 23,70,000 in one clause
// and Rs. 33,70,000 in the schedule), instalments that do not add up to the
// total, dates out of order. Each card's "View all evidence" highlights
// every conflicting span at once.
export function ConsistencyTab({
  risks,
  highlightId,
}: {
  risks: Risk[];
  highlightId?: string | null;
}) {
  const findings = risks.filter((r) => r.pass === "CONSISTENCY" && r.modelSource === "RULE_BASED");
  return (
    <div className="flex flex-col gap-3 p-4">
      <PermanentNotice>
        Consistency checks compare values the document states more than once. A difference is a
        potential issue to review - it may be a typo, or intentional.
      </PermanentNotice>
      {findings.length === 0 ? (
        <EmptyState title="No internal inconsistencies were found between repeated values." />
      ) : (
        <div className="flex flex-col gap-2">
          {findings.map((risk) => (
            <RiskCard key={risk.id} risk={risk} highlighted={risk.id === highlightId} />
          ))}
        </div>
      )}
    </div>
  );
}
