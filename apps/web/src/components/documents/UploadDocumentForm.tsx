"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { listDomainPacks, uploadDocument } from "@/lib/api";
import type { DomainPackSummary } from "@/lib/apiTypes";
import { Button } from "@/components/ui/Button";

// Document types come from GET /domain-packs (the API's DomainPack
// registry), so registering a pack server-side is all it takes for a new
// document type to appear here - this component holds no list of its own.
// Grouped by domain because one domain can own several document types
// (e.g. agreement to sell + sale deed).
export function UploadDocumentForm({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<DomainPackSummary[] | null>(null);
  const [documentType, setDocumentType] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || packs) return;
    let cancelled = false;
    listDomainPacks()
      .then((loaded) => {
        if (cancelled) return;
        setPacks(loaded);
        setDocumentType((current) => current || (loaded[0]?.documentTypes[0]?.slug ?? ""));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load document types");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, packs]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await uploadDocument(file, documentType);
      setOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add document
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 bg-paper-50 p-4 shadow-subtle"
    >
      <label className="flex flex-col gap-1 text-xs text-ink-500">
        Document type
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          disabled={!packs}
          className="rounded border border-ink-200 bg-paper-50 px-2 py-1.5 text-sm text-ink-800"
        >
          {!packs && <option value="">Loading…</option>}
          {packs?.map((pack) => (
            <optgroup key={pack.id} label={pack.name}>
              {pack.documentTypes.map((dt) => (
                <option key={dt.slug} value={dt.slug}>
                  {dt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-500">
        File (.pdf or .docx)
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          required
          className="text-sm text-ink-700 file:mr-2 file:rounded file:border-0 file:bg-ink-100 file:px-2 file:py-1 file:text-xs"
        />
      </label>
      <Button type="submit" variant="primary" disabled={submitting || !documentType}>
        {submitting ? "Uploading..." : "Upload"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-risk-text">
          {error}
        </p>
      )}
    </form>
  );
}
