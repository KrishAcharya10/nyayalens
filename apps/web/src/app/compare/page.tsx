"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { useHandleUnauthorized, useRequireAuth } from "@/lib/AuthProvider";
import { compareDocuments, listDocumentSummaries } from "@/lib/api";
import type { DocumentComparison, DocumentSummary } from "@/lib/apiTypes";
import { ComparisonView } from "@/components/compare/ComparisonView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { formatDocumentType } from "@/lib/format";

export default function ComparePage() {
  const { isReady } = useRequireAuth();
  const handleUnauthorized = useHandleUnauthorized();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    listDocumentSummaries()
      .then((docs) => {
        const ready = docs.filter((d) => d.processingStatus === "READY");
        setDocuments(ready);
        const params = new URLSearchParams(window.location.search);
        setA(params.get("a") ?? ready[0]?.id ?? "");
        setB(params.get("b") ?? ready[1]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (handleUnauthorized(err)) return;
        setError(err instanceof Error ? err.message : "Could not load documents");
      });
  }, [isReady, handleUnauthorized]);

  const run = useCallback(async () => {
    if (!a || !b) return;
    setLoading(true);
    setError(null);
    try {
      setComparison(await compareDocuments(a, b));
      window.history.replaceState(null, "", `/compare?a=${a}&b=${b}`);
    } catch (err) {
      if (handleUnauthorized(err)) return;
      setError(err instanceof Error ? err.message : "Could not compare documents");
    } finally {
      setLoading(false);
    }
  }, [a, b, handleUnauthorized]);

  if (!isReady) return null;

  const picker = (id: string, value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-500" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-ink-200 bg-paper-50 px-2 py-1.5 text-sm text-ink-800"
      >
        {documents?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} ({formatDocumentType(d.documentType)})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-4xl overflow-y-auto px-4 py-8 sm:px-6">
        <h1 className="text-page-title text-ink-900">Compare documents</h1>
        <p className="mt-0.5 text-sm text-ink-400">
          Two versions of an agreement, or two agreements of the same kind, side by side.
        </p>
        {documents === null && !error && <LoadingState label="Loading your documents..." />}
        {documents && documents.length < 2 && (
          <EmptyState
            title="You need at least two processed documents to compare."
            hint="Upload another document from the Documents page."
          />
        )}
        {documents && documents.length >= 2 && (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
            {picker("compare-a", a, setA, "Document A")}
            {picker("compare-b", b, setB, "Document B")}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void run()}
              disabled={!a || !b || loading}
            >
              Compare
            </Button>
          </div>
        )}
        <div className="mt-6">
          {error && <ErrorState message={error} />}
          {loading && <LoadingState label="Comparing..." />}
          {comparison && !loading && <ComparisonView comparison={comparison} />}
        </div>
      </div>
    </AppShell>
  );
}
