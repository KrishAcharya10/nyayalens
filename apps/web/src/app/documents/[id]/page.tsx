"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { useHandleUnauthorized, useRequireAuth } from "@/lib/AuthProvider";
import { deleteDocument, getClauses, getDocument, getEntities, getRisks } from "@/lib/api";
import type { DocumentClause, DocumentDetail, Entity, Risk } from "@/lib/apiTypes";
import { EvidenceFocusProvider } from "@/components/workspace/EvidenceFocusContext";
import { DocumentOutline } from "@/components/workspace/DocumentOutline";
import { DocumentSearch } from "@/components/workspace/DocumentSearch";
import { DocumentViewer } from "@/components/workspace/DocumentViewer";
import { IntelligencePanel } from "@/components/workspace/IntelligencePanel";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { domainForDocumentType } from "@/lib/domains";
import { formatDate, formatDocumentType } from "@/lib/format";
import { ErrorState, LoadingState } from "@/components/ui/States";

interface WorkspaceData {
  document: DocumentDetail;
  entities: Entity[];
  clauses: DocumentClause[];
  risks: Risk[];
}

export default function DocumentWorkspacePage() {
  const { isReady } = useRequireAuth();
  const handleUnauthorized = useHandleUnauthorized();
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // null = not loaded yet, "not-found" = a definitive 404/403 (never a
  // partial render of stale data in this state - Section 14/DoD).
  const [data, setData] = useState<WorkspaceData | "not-found" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [document, entities, clauses, risks] = await Promise.all([
        getDocument(params.id),
        getEntities(params.id),
        getClauses(params.id),
        getRisks(params.id),
      ]);
      setData({ document, entities, clauses, risks });
      setError(null);
    } catch (err) {
      if (handleUnauthorized(err)) return;
      if (err instanceof Error && err.name === "NotFoundError") {
        setData("not-found");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load this document");
    }
  }, [params.id, handleUnauthorized]);

  useEffect(() => {
    if (isReady) void load();
  }, [isReady, load]);

  async function handleDelete() {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteDocument(params.id);
      router.push("/documents");
    } catch (err) {
      if (handleUnauthorized(err)) return;
      setError(err instanceof Error ? err.message : "Could not delete this document");
      setDeleting(false);
    }
  }

  if (!isReady) return null;

  return (
    <AppShell compact>
      {data === "not-found" ? (
        <div className="flex h-full items-center justify-center">
          <ErrorState message="Document not found." />
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : data === null ? (
        <div className="flex h-full items-center justify-center">
          <LoadingState label="Loading document..." />
        </div>
      ) : (
        <EvidenceFocusProvider>
          <WorkspaceLayout data={data} onDelete={handleDelete} deleting={deleting} />
        </EvidenceFocusProvider>
      )}
    </AppShell>
  );
}

function WorkspaceLayout({
  data,
  onDelete,
  deleting,
}: {
  data: WorkspaceData;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { document } = data;
  const domain = domainForDocumentType(document.documentType);
  const risks = data.risks.filter((r) => r.modelSource === "RULE_BASED");
  const high = risks.filter((r) => r.severity === "HIGH").length;
  const clauses = data.clauses.filter((c) => c.modelSource === "RULE_BASED").length;
  const entities = data.entities.filter((e) => e.modelSource === "RULE_BASED").length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-200 bg-paper-50 px-5 py-3">
        <Link
          href="/documents"
          title="All documents"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-paper-200 hover:text-ink-800"
        >
          <Icon name="arrowLeft" />
          <span className="sr-only">All documents</span>
        </Link>
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold ${domain.tile}`}
        >
          {domain.mark}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink-900" title={document.title}>
            {document.title}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
            <span>{formatDocumentType(document.documentType)}</span>
            <span className="text-ink-300">·</span>
            <span>{domain.name}</span>
            <span className="text-ink-300">·</span>
            <span>
              {document.pages.length} page{document.pages.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink-300">·</span>
            <span>Uploaded {formatDate(document.createdAt)}</span>
          </p>
        </div>
        <div className="hidden items-center gap-1.5 xl:flex">
          <Badge tone="neutral">{clauses} clauses</Badge>
          <Badge tone="neutral">{entities} entities</Badge>
          <Badge tone={risks.length === 0 ? "safe" : high > 0 ? "risk" : "review"}>
            {risks.length} potential issue{risks.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/compare?a=${document.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-ink-200 bg-paper-50 px-3 text-sm font-medium text-ink-700 hover:bg-paper-200"
          >
            <Icon name="compare" />
            Compare
          </Link>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium text-risk-text hover:bg-risk-bg disabled:text-ink-300"
          >
            <Icon name="trash" />
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(400px,42%)] lg:grid-cols-[200px_minmax(0,1fr)_minmax(420px,40%)]">
        <aside className="hidden min-h-0 flex-col border-r border-ink-200 bg-paper-50 lg:flex">
          <DocumentSearch clauses={data.clauses} entities={data.entities} />
          <DocumentOutline clauses={data.clauses} />
        </aside>
        <section className="min-h-0 overflow-y-auto bg-paper-200/60 px-4 py-6">
          <div className="mx-auto max-w-[780px] rounded-sm border border-ink-200 bg-paper-50 shadow-panel">
            <DocumentViewer
              canonicalText={document.canonicalText}
              clauses={data.clauses}
              entities={data.entities}
            />
          </div>
        </section>
        <aside className="min-h-0 min-w-0 overflow-hidden border-l border-ink-200 bg-paper-50">
          <IntelligencePanel
            document={document}
            entities={data.entities}
            clauses={data.clauses}
            risks={data.risks}
          />
        </aside>
      </div>
    </div>
  );
}
