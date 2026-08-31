"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { useHandleUnauthorized, useRequireAuth } from "@/lib/AuthProvider";
import { listDocumentSummaries } from "@/lib/api";
import type { DocumentSummary } from "@/lib/apiTypes";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";

export default function DocumentsPage() {
  const { isReady } = useRequireAuth();
  const handleUnauthorized = useHandleUnauthorized();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await listDocumentSummaries());
      setError(null);
    } catch (err) {
      if (handleUnauthorized(err)) return;
      setError(err instanceof Error ? err.message : "Could not load documents");
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    if (isReady) void load();
  }, [isReady, load]);

  // Poll only while at least one document is still processing - avoids
  // repeated requests once everything has settled (Section 36).
  useEffect(() => {
    if (
      !documents?.some(
        (d) => d.processingStatus === "PROCESSING" || d.processingStatus === "NOT_STARTED",
      )
    ) {
      return;
    }
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [documents, load]);

  if (!isReady) return null;

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-page-title text-ink-900">Documents</h1>
            <p className="mt-0.5 text-sm text-ink-400">
              Residential rental agreements and land lease deeds.
            </p>
          </div>
          <UploadDocumentForm onUploaded={load} />
        </div>

        {documents === null && !error && <LoadingState label="Loading your documents..." />}
        {error && <ErrorState message={error} onRetry={load} />}
        {documents && documents.length === 0 && (
          <EmptyState
            title="No documents yet"
            hint="Add a residential rental agreement or land lease deed to begin."
          />
        )}
        {documents && documents.length > 0 && (
          <div className="rounded-lg border border-ink-200 bg-paper-50 shadow-subtle">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
