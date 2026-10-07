"use client";

import { useRef, useState, type FormEvent } from "react";
import { uploadDocument } from "@/lib/api";
import { Button } from "@/components/ui/Button";

// The set of document types this deployment accepts, mirroring
// apps/api/src/routes/documents.ts's uploadMetadataSchema (still that
// file's own literal two-value z.enum today - not yet sourced from the
// DomainPack registry over the network; see
// docs/phase8/step2_migration_notes.md for why that wiring was deferred).
// Rendering from this list instead of two hand-written <option> elements
// is what's actually rewired in this step: adding a value here is a
// one-line, purely-additive change to this component instead of touching
// both the type annotation above and the JSX below.
const DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "residential_rental", label: "Residential Rental" },
  { value: "land_lease", label: "Land Lease" },
];

export function UploadDocumentForm({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPE_OPTIONS[0]!.value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          className="rounded border border-ink-200 bg-paper-50 px-2 py-1.5 text-sm text-ink-800"
        >
          {DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
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
      <Button type="submit" variant="primary" disabled={submitting}>
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
