import type { DocumentOverview, DomainDetection } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";
import { EvidenceButton } from "./EvidenceButton";

// Phase 8: the domain-specific overview - the DomainPack's own overview
// fields (sale consideration for a sale, CTC for an offer letter, licence
// fee for a leave-and-licence), each with its evidence span. An absent
// field reads "Not found in the document" - never a placeholder value.
export function DomainOverviewCard({ overview }: { overview: DocumentOverview }) {
  return (
    <section aria-label={`${overview.domainName} key terms`}>
      <div className="flex items-center gap-2">
        <p className="text-section-title text-ink-500">Key terms</p>
        <Badge tone="info">{overview.domainName}</Badge>
      </div>
      <dl className="mt-1.5 flex flex-col gap-1.5 text-sm">
        {overview.fields.map((field) => (
          <div key={field.label} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3">
            <dt className="text-ink-400">{field.displayName}</dt>
            <dd className="min-w-0">
              {field.value === null ? (
                <span className="text-ink-300">Not found in the document</span>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="break-words text-ink-700">{field.values.join(", ")}</span>
                  {field.evidence && (
                    <EvidenceButton entityIds={[field.evidence.entityId]} label="View" />
                  )}
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Shown when the document's own title/wording points to a different domain
// than the one it was uploaded as. Signals, not a probability: the backend's
// detector is a deterministic count (apps/api/src/domains/detectDomain.ts).
export function DetectionNotice({
  detection,
  domainNames,
}: {
  detection: DomainDetection | null;
  domainNames?: Record<string, string>;
}) {
  if (!detection || detection.agreesWithDeclared !== false || !detection.predictedDomain) {
    return null;
  }
  const name = (id: string | undefined) =>
    id ? (domainNames?.[id] ?? humanizeLabel(id)) : "another domain";
  return (
    <div data-testid="detection-notice">
      <PermanentNotice>
        <p className="font-medium text-ink-700">Review required: possible domain mismatch</p>
        <p className="mt-1">
          This document was uploaded as {name(detection.declaredDomain)}, but its title and wording
          look more like {name(detection.predictedDomain)}. Extracted terms use the uploaded
          domain&apos;s schema, so some fields may be missing.
        </p>
        {detection.supportingSignals.length > 0 && (
          <p className="mt-1 text-xs text-ink-400">
            Signals: {detection.supportingSignals.slice(0, 4).join("; ")}
          </p>
        )}
      </PermanentNotice>
    </div>
  );
}
