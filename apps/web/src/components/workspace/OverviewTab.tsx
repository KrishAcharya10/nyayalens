import type { DocumentDetail, DocumentOverview, Entity, Risk } from "@/lib/apiTypes";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatDocumentType, humanizeLabel } from "@/lib/format";
import { DetectionNotice, DomainOverviewCard } from "./DomainOverviewCard";

const PARTY_LABELS = ["LANDLORD", "TENANT", "LESSOR", "LESSEE"];

// Section 14: uses key_findings when it's actually populated - this
// environment's backend documents key_findings as reserved-but-not-yet-
// fully-populated (see docs/architecture/risk_engine.md), so in practice
// this always falls through to composing a summary from the real,
// already-fetched entities/clauses/risks rather than showing an empty
// section or fabricating prose.
//
// Phase 8: when the domain overview (GET /documents/:id/overview) is
// available, parties and key terms come from the document's DomainPack, so
// a sale shows its seller/buyer and consideration rather than rental
// labels; without it the Phase 7B rental/land-lease view is unchanged.
export function OverviewTab({
  document,
  entities,
  risks,
  overview = null,
}: {
  document: DocumentDetail;
  entities: Entity[];
  risks: Risk[];
  overview?: DocumentOverview | null;
}) {
  const ruleBasedEntities = entities.filter((e) => e.modelSource === "RULE_BASED");
  const partyLabels = overview
    ? overview.fields.filter((f) => f.coreType === "PARTY").map((f) => f.label)
    : PARTY_LABELS;
  const parties = ruleBasedEntities.filter((e) => partyLabels.includes(e.label));
  const ruleBasedRisks = risks.filter((r) => r.modelSource === "RULE_BASED");
  const missingClauses = ruleBasedRisks.filter((r) => r.category === "MISSING_CLAUSE");
  const highRisks = ruleBasedRisks.filter((r) => r.severity === "HIGH").length;

  return (
    <div className="flex flex-col gap-4 p-3">
      {overview && <DetectionNotice detection={overview.detection} />}
      <section>
        <p className="text-section-title text-ink-500">Document</p>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-400">Type</dt>
          <dd className="text-ink-700">{formatDocumentType(document.documentType)}</dd>
          <dt className="text-ink-400">Pages</dt>
          <dd className="text-ink-700">{document.pages.length}</dd>
          <dt className="text-ink-400">Uploaded</dt>
          <dd className="text-ink-700">{formatDate(document.createdAt)}</dd>
          {document.isSynthetic && (
            <>
              <dt className="text-ink-400">Source</dt>
              <dd className="text-ink-700">Synthetic test document</dd>
            </>
          )}
        </dl>
      </section>

      {document.keyFindings?.summary ? (
        <section>
          <p className="text-section-title text-ink-500">Summary</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            {document.keyFindings.summary}
          </p>
        </section>
      ) : null}

      {overview && overview.fields.some((f) => f.coreType !== "PARTY") && (
        <DomainOverviewCard
          overview={{ ...overview, fields: overview.fields.filter((f) => f.coreType !== "PARTY") }}
        />
      )}

      <section>
        <p className="text-section-title text-ink-500">Parties</p>
        {parties.length === 0 ? (
          <p className="mt-1.5 text-sm text-ink-400">No party entities were extracted.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {parties.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Badge tone="neutral">{humanizeLabel(p.label)}</Badge>
                <span className="text-ink-700">{p.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="text-section-title text-ink-500">Risk findings</p>
        <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-700">
          <Badge tone={ruleBasedRisks.length === 0 ? "safe" : highRisks > 0 ? "risk" : "review"}>
            {ruleBasedRisks.length} finding{ruleBasedRisks.length === 1 ? "" : "s"}
          </Badge>
          {highRisks > 0 && <span className="text-ink-500">{highRisks} high severity</span>}
        </div>
      </section>

      {missingClauses.length > 0 && (
        <section>
          <p className="text-section-title text-ink-500">Possibly missing clauses</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-sm text-ink-700">
            {missingClauses.map((r) => (
              <li key={r.id}>{r.reason}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
