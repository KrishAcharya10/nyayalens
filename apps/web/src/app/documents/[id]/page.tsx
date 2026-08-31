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
import { Button } from "@/components/ui/Button";
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
    <AppShell>
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
          <div className="grid h-full grid-cols-[220px_1fr_360px]">
            <aside className="flex flex-col border-r border-ink-200 bg-paper-50">
              <DocumentSearch clauses={data.clauses} entities={data.entities} />
              <DocumentOutline document={data.document} clauses={data.clauses} />
            </aside>
            <section className="flex flex-col overflow-hidden bg-paper-100">
              <div className="flex items-center justify-between border-b border-ink-200 bg-paper-50 px-4 py-2">
                <Link href="/documents" className="text-xs text-ink-500 hover:underline">
                  ← All documents
                </Link>
                <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete document"}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DocumentViewer
                  canonicalText={data.document.canonicalText}
                  clauses={data.clauses}
                  entities={data.entities}
                />
              </div>
            </section>
            <aside className="border-l border-ink-200 bg-paper-50">
              <IntelligencePanel
                document={data.document}
                entities={data.entities}
                clauses={data.clauses}
                risks={data.risks}
              />
            </aside>
          </div>
        </EvidenceFocusProvider>
      )}
    </AppShell>
  );
}
