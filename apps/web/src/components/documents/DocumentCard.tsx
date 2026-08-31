import Link from "next/link";
import type { DocumentSummary } from "@/lib/apiTypes";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/States";
import { formatDate, formatDocumentType, formatFileSize } from "@/lib/format";

const STATUS_LABEL: Record<DocumentSummary["processingStatus"], string> = {
  NOT_STARTED: "Queued",
  PROCESSING: "Analyzing",
  READY: "Ready",
  FAILED: "Processing failed",
};

const STATUS_TONE: Record<DocumentSummary["processingStatus"], Tone> = {
  NOT_STARTED: "neutral",
  PROCESSING: "info",
  READY: "safe",
  FAILED: "risk",
};

// A document reads as a "case file," not a database row: title first,
// document type as the primary classifier, status as a quiet badge - not
// a KPI-dashboard card.
export function DocumentCard({ doc }: { doc: DocumentSummary }) {
  const clickable = doc.processingStatus === "READY";
  const body = (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-4 py-3 last:border-b-0 hover:bg-paper-200/60">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-800">{doc.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span>{formatDocumentType(doc.documentType)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatFileSize(doc.fileSizeBytes)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDate(doc.createdAt)}</span>
          {doc.isSynthetic && (
            <>
              <span aria-hidden="true">·</span>
              <span>Synthetic</span>
            </>
          )}
        </div>
      </div>
      <Badge tone={STATUS_TONE[doc.processingStatus]}>
        {doc.processingStatus === "PROCESSING" && <Spinner className="h-2.5 w-2.5 text-current" />}
        {STATUS_LABEL[doc.processingStatus]}
      </Badge>
    </div>
  );

  if (!clickable) {
    return <div aria-disabled="true">{body}</div>;
  }
  return (
    <Link href={`/documents/${doc.id}`} className="block">
      {body}
    </Link>
  );
}
