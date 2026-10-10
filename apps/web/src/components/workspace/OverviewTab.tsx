import type {
  DocumentDetail,
  DocumentOverview,
  Entity,
  OverviewField,
  Risk,
  RiskSeverity,
} from "@/lib/apiTypes";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatDocumentType, humanizeLabel } from "@/lib/format";
import { DetectionNotice, DomainOverviewCard } from "./DomainOverviewCard";
import { useEvidenceFocus } from "./EvidenceFocusContext";

const PARTY_LABELS = ["LANDLORD", "TENANT", "LESSOR", "LESSEE"];
const SEVERITY_RANK: Record<RiskSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const SEVERITY_DOT: Record<RiskSeverity, string> = {
  HIGH: "bg-risk-strong",
  MEDIUM: "bg-review-strong",
  LOW: "bg-info-strong",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{children}</h3>;
}

function initials(name: string): string {
  const words = name
    .replace(/^(?:shri|smt|mr|mrs|ms|dr|m\/s)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

// What needs review: consistency findings first, then other findings by
// severity. Each row jumps to its evidence in the document.
function AttentionCard({
  risks,
  onNavigate,
}: {
  risks: Risk[];
  onNavigate?: ((tab: string) => void) | undefined;
}) {
  const { focusEvidence } = useEvidenceFocus();
  const issues = risks.filter((r) => r.category !== "MISSING_CLAUSE");
  if (risks.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-safe-border bg-safe-bg px-4 py-3">
        <Icon name="shield" size={18} className="mt-0.5 text-safe-strong" />
        <div>
          <p className="text-sm font-medium text-safe-text">No potential issues flagged</p>
          <p className="mt-0.5 text-xs text-safe-text/80">
            The checks found nothing to review. That is not a guarantee the agreement is sound.
          </p>
        </div>
      </div>
    );
  }
  const top = [...issues]
    .sort(
      (a, b) =>
        Number(b.pass === "CONSISTENCY") - Number(a.pass === "CONSISTENCY") ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    )
    .slice(0, 3);
  const consistency = risks.filter((r) => r.pass === "CONSISTENCY").length;
  const high = risks.filter((r) => r.severity === "HIGH").length;
  return (
    <div className="overflow-hidden rounded-lg border border-review-border bg-paper-50">
      <div className="flex items-center gap-2 border-b border-review-border bg-review-bg px-4 py-2.5">
        <Icon name="alert" size={16} className="text-review-strong" />
        <p className="text-sm font-medium text-review-text">
          {risks.length} item{risks.length === 1 ? "" : "s"} to review
          {high > 0 && <span className="font-normal"> · {high} high severity</span>}
        </p>
      </div>
      {top.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {top.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() =>
                  focusEvidence(
                    r.evidence
                      .filter((e) => e.sourceTable === "document_clauses")
                      .map((e) => e.sourceId),
                    r.evidence.filter((e) => e.sourceTable === "entities").map((e) => e.sourceId),
                  )
                }
                className="flex w-full gap-2.5 px-4 py-2.5 text-left hover:bg-paper-100"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[r.severity]}`}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink-700">
                    {humanizeLabel(r.category)}
                    <span className="font-normal text-ink-400"> · {r.severity.toLowerCase()}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-500">
                    {r.reason}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onNavigate && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 px-4 py-2 text-xs font-medium">
          {consistency > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("consistency")}
              className="text-info-strong hover:underline"
            >
              Inconsistencies ({consistency})
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate("risks")}
            className="text-info-strong hover:underline"
          >
            All potential issues ({risks.length})
          </button>
        </div>
      )}
    </div>
  );
}

// Amounts the agreement states, as one bar list (single series: one hue,
// values labelled directly, no legend). Bars are relative to the largest.
function AmountBars({ fields }: { fields: OverviewField[] }) {
  const rows = fields
    .map((f) => ({
      f,
      amount: typeof f.normalized?.amount === "number" ? f.normalized.amount : null,
    }))
    .filter((r): r is { f: OverviewField; amount: number } => r.amount !== null && r.amount > 0);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map((r) => r.amount));
  return (
    <section>
      <SectionTitle>Amounts</SectionTitle>
      <ul className="mt-2 flex flex-col gap-2.5">
        {rows.map(({ f, amount }) => (
          <li key={f.label} title={`${f.displayName}: ${f.value}`}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-ink-500">{f.displayName}</span>
              <span className="font-medium tabular-nums text-ink-800">
                ₹{amount.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-r-[4px] bg-paper-200">
              <div
                className="h-2 rounded-r-[4px] bg-saffron-500"
                style={{ width: `${Math.max(2, (amount / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The agreement's dates in calendar order.
function DateTimeline({ fields }: { fields: OverviewField[] }) {
  const rows = fields
    .map((f) => ({ f, iso: typeof f.normalized?.iso === "string" ? f.normalized.iso : null }))
    .filter((r): r is { f: OverviewField; iso: string } => r.iso !== null)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionTitle>Key dates</SectionTitle>
      <ol className="mt-2 border-l border-ink-200 pl-4">
        {rows.map(({ f, iso }) => (
          <li key={f.label} className="relative pb-3 last:pb-0">
            <span
              aria-hidden="true"
              className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-paper-50 bg-ink-700"
            />
            <p className="text-sm font-medium text-ink-800">
              {new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            <p className="text-xs text-ink-500">{f.displayName}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Section 14 + Phase 8: the document at a glance. With the domain overview
// (GET /documents/:id/overview) parties and key terms come from the
// document's DomainPack, so a sale shows its seller/buyer and consideration
// rather than rental labels; without it the Phase 7B view is used.
export function OverviewTab({
  document,
  entities,
  risks,
  overview = null,
  obligationCount = null,
  onNavigate,
}: {
  document: DocumentDetail;
  entities: Entity[];
  risks: Risk[];
  overview?: DocumentOverview | null;
  obligationCount?: number | null;
  onNavigate?: (tab: string) => void;
}) {
  const ruleBasedEntities = entities.filter((e) => e.modelSource === "RULE_BASED");
  const partyFields = overview?.fields.filter((f) => f.coreType === "PARTY" && f.value) ?? [];
  const termFields = overview?.fields.filter((f) => f.coreType !== "PARTY") ?? [];
  // Without the overview: one row per role + name (a party is mentioned in
  // the preamble, the body and the signature block, but is one party).
  const legacyParties = [
    ...new Map(
      ruleBasedEntities
        .filter((e) => PARTY_LABELS.includes(e.label))
        .map((e) => [`${e.label}|${(e.text ?? "").replace(/\s+/g, " ").toLowerCase()}`, e]),
    ).values(),
  ];
  const parties = overview
    ? partyFields.flatMap((f) =>
        f.values.map((v) => ({ key: `${f.label}|${v}`, role: f.displayName, name: v })),
      )
    : legacyParties.map((e) => ({ key: e.id, role: humanizeLabel(e.label), name: e.text ?? "" }));
  const ruleBasedRisks = risks.filter((r) => r.modelSource === "RULE_BASED");
  const missingClauses = ruleBasedRisks.filter((r) => r.category === "MISSING_CLAUSE");

  return (
    <div className="flex flex-col gap-5 p-4">
      {overview && <DetectionNotice detection={overview.detection} />}

      <AttentionCard risks={ruleBasedRisks} onNavigate={onNavigate} />

      {document.keyFindings?.summary ? (
        <section>
          <SectionTitle>Summary</SectionTitle>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            {document.keyFindings.summary}
          </p>
        </section>
      ) : null}

      <section>
        <SectionTitle>Parties</SectionTitle>
        {parties.length === 0 ? (
          <p className="mt-1.5 text-sm text-ink-400">No party entities were extracted.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {parties.map((p) => (
              <li
                key={p.key}
                className="flex items-center gap-2.5 rounded-md border border-ink-200 bg-paper-50 px-3 py-2"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-paper-50"
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-800">{p.name}</span>
                  <span className="block text-xs text-ink-400">{p.role}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview && termFields.length > 0 && (
        <DomainOverviewCard overview={{ ...overview, fields: termFields }} />
      )}

      {overview && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <AmountBars fields={termFields.filter((f) => f.coreType === "MONEY")} />
          <DateTimeline fields={termFields.filter((f) => f.coreType === "DATE")} />
        </div>
      )}

      {missingClauses.length > 0 && (
        <section>
          <SectionTitle>Possibly missing clauses</SectionTitle>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-700">
            {missingClauses.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-400"
                />
                {r.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-ink-100 bg-paper-100 px-3 py-2.5">
        <SectionTitle>Document</SectionTitle>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-ink-400">Type</dt>
          <dd className="text-ink-700">{formatDocumentType(document.documentType)}</dd>
          <dt className="text-ink-400">Pages</dt>
          <dd className="text-ink-700">{document.pages.length}</dd>
          <dt className="text-ink-400">Uploaded</dt>
          <dd className="text-ink-700">{formatDate(document.createdAt)}</dd>
          {obligationCount !== null && (
            <>
              <dt className="text-ink-400">Obligations</dt>
              <dd className="text-ink-700">{obligationCount}</dd>
            </>
          )}
          {document.isSynthetic && (
            <>
              <dt className="text-ink-400">Source</dt>
              <dd className="text-ink-700">Synthetic test document</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
