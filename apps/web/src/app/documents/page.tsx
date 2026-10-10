"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { useHandleUnauthorized, useRequireAuth } from "@/lib/AuthProvider";
import { listDocumentSummaries } from "@/lib/api";
import type { DocumentSummary } from "@/lib/apiTypes";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { domainForDocumentType } from "@/lib/domains";

const DOMAIN_NAMES = [
  "Residential rental",
  "Leave and licence",
  "Land lease",
  "Sale of property",
  "Builder-buyer",
  "Employment",
  "NDA / services",
];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-paper-50 px-4 py-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-800">{value}</p>
    </div>
  );
}

export default function DocumentsPage() {
  const { isReady } = useRequireAuth();
  const handleUnauthorized = useHandleUnauthorized();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);

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

  const domainsPresent = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of documents ?? []) {
      const dom = domainForDocumentType(d.documentType);
      m.set(dom.id, dom.name);
    }
    return [...m.entries()];
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) =>
        (!q || d.title.toLowerCase().includes(q)) &&
        (!domainFilter || domainForDocumentType(d.documentType).id === domainFilter),
    );
  }, [documents, query, domainFilter]);

  if (!isReady) return null;

  const ready = documents?.filter((d) => d.processingStatus === "READY").length ?? 0;
  const inProgress =
    documents?.filter(
      (d) => d.processingStatus === "PROCESSING" || d.processingStatus === "NOT_STARTED",
    ).length ?? 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-page-title text-ink-900">Documents</h1>
              <p className="mt-1 text-sm text-ink-500">
                Upload an agreement to see its key terms, obligations and potential issues, each
                linked to the exact text.
              </p>
            </div>
            <UploadDocumentForm onUploaded={load} />
          </div>

          {documents === null && !error && (
            <div className="mt-10">
              <LoadingState label="Loading your documents..." />
            </div>
          )}
          {error && (
            <div className="mt-10">
              <ErrorState message={error} onRetry={load} />
            </div>
          )}

          {documents && documents.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-ink-300 bg-paper-50 px-6 py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper-200 text-ink-500">
                <Icon name="documents" size={22} />
              </span>
              <p className="mt-4 text-section-title text-ink-800">No documents yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                Add an agreement - choose its type when uploading - to begin. Supported:
              </p>
              <ul className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-1.5">
                {DOMAIN_NAMES.map((d) => (
                  <li
                    key={d}
                    className="rounded-full border border-ink-200 bg-paper-100 px-2.5 py-0.5 text-xs text-ink-600"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {documents && documents.length > 0 && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Documents" value={documents.length} />
                <Stat label="Ready to review" value={ready} />
                <Stat label="Being analysed" value={inProgress} />
                <Stat label="Domains" value={domainsPresent.length} />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <label className="relative flex-1 sm:max-w-xs">
                  <span className="sr-only">Search documents by title</span>
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by title"
                    className="h-9 w-full rounded border border-ink-200 bg-paper-50 pl-8 pr-2 text-sm text-ink-800"
                  />
                </label>
                {domainsPresent.length > 1 && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Filter by domain"
                  >
                    {[["", "All"] as const, ...domainsPresent].map(([id, name]) => {
                      const active = (domainFilter ?? "") === id;
                      return (
                        <button
                          key={id || "all"}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setDomainFilter(id || null)}
                          className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                            active
                              ? "border-ink-800 bg-ink-800 text-paper-50"
                              : "border-ink-200 bg-paper-50 text-ink-600 hover:bg-paper-200"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {visible.length === 0 ? (
                <p className="mt-8 text-center text-sm text-ink-400">
                  No documents match this search.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {visible.map((doc) => (
                    <li key={doc.id}>
                      <DocumentCard doc={doc} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
