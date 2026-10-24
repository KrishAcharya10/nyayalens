"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { listDomainPacks, uploadDocument } from "@/lib/api";
import type { DomainPackSummary } from "@/lib/apiTypes";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";

// Document types come from GET /domain-packs (the API's DomainPack
// registry), so registering a pack server-side is all it takes for a new
// document type to appear here - this component holds no list of its own.
// Grouped by domain because one domain can own several document types
// (e.g. agreement to sell + sale deed). The form opens as a dialog with a
// drop zone; the file input stays a real, labelled input underneath.
export function UploadDocumentForm({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<DomainPackSummary[] | null>(null);
  const [documentType, setDocumentType] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
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

  function close() {
    setOpen(false);
    setFileName(null);
    setError(null);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (!files.length || !fileInputRef.current) return;
    fileInputRef.current.files = files;
    setFileName(files[0]?.name ?? null);
  }

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
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Icon name="upload" />
        Add document
      </Button>
      {/* Dialog: focus moves in, Tab stays inside, Escape and the backdrop close it
          (not while an upload is in flight), and focus returns to this button. */}
      <Dialog
        open={open}
        onClose={() => {
          if (!submitting) close();
        }}
        labelledBy="upload-title"
        className="w-full max-w-lg"
      >
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-lg rounded-lg border border-ink-200 bg-paper-50 shadow-panel"
        >
          <div className="flex items-start justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 id="upload-title" className="text-section-title text-ink-800">
                Add a document
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                It is analysed on this machine; nothing is sent anywhere else.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            >
              <Icon name="x" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-600">
              Document type
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                disabled={!packs}
                className="h-9 rounded border border-ink-200 bg-paper-50 px-2 text-sm font-normal text-ink-800"
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

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragging
                  ? "border-saffron-500 bg-saffron-100/50"
                  : "border-ink-200 bg-paper-100 hover:border-ink-300"
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-50 text-ink-500 shadow-subtle">
                <Icon name="upload" size={18} />
              </span>
              {fileName ? (
                <span className="text-sm font-medium text-ink-800">{fileName}</span>
              ) : (
                <span className="text-sm text-ink-600">
                  <span className="font-medium text-ink-800">Choose a file</span> or drag it here
                </span>
              )}
              <span className="text-xs text-ink-400">File (.pdf or .docx), up to 20 MB</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded border border-risk-border bg-risk-bg px-3 py-2 text-xs text-risk-text"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !documentType}>
              {submitting ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
