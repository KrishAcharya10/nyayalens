import type { DocumentOverview, DomainDetection, OverviewField } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";
import { EvidenceButton } from "./EvidenceButton";

const CORE_ICON: Record<string, IconName> = {
  MONEY: "tag",
  DATE: "calendar",
  DURATION: "clock",
  PERCENT: "tag",
  ADDRESS: "file",
  LOCATION: "file",
  PROPERTY_IDENTIFIER: "file",
  AREA: "file",
  TEXT: "file",
  PARTY: "user",
  PERSON: "user",
  ORGANIZATION: "user",
};

function TermCard({ field }: { field: OverviewField }) {
  if (field.value === null) {
    return (
      <div className="flex flex-col justify-between rounded-md border border-dashed border-ink-200 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
          {field.displayName}
        </p>
        <p className="mt-1 text-xs text-ink-400">Not found in the document</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col rounded-md border border-ink-200 bg-paper-50 px-3 py-2.5 shadow-subtle">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
          <Icon name={CORE_ICON[field.coreType] ?? "file"} size={12} />
          <span className="truncate">{field.displayName}</span>
        </p>
        {field.evidence && <EvidenceButton entityIds={[field.evidence.entityId]} label="View" />}
      </div>
      <p className="mt-1 line-clamp-3 break-words text-[15px] font-medium leading-snug text-ink-900">
        {field.values.join(", ")}
      </p>
    </div>
  );
}

// Phase 8: the domain-specific key terms - the DomainPack's own overview
// fields (sale consideration for a sale, CTC for an offer letter, licence
// fee for a leave-and-licence), each with its evidence span. An absent
// field reads "Not found in the document" - never a placeholder value.
export function DomainOverviewCard({ overview }: { overview: DocumentOverview }) {
  return (
    <section aria-label={`${overview.domainName} key terms`}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Key terms</h3>
        <Badge tone="info">{overview.domainName}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {overview.fields.map((field) => (
          <TermCard key={field.label} field={field} />
        ))}
      </div>
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
