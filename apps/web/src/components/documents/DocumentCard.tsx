import Link from "next/link";
import type { DocumentSummary } from "@/lib/apiTypes";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/States";
import { domainForDocumentType } from "@/lib/domains";
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

// A document reads as a case file: its domain tile, title, type and
// status, and - once analysed - a clear way into the analysis.
export function DocumentCard({ doc }: { doc: DocumentSummary }) {
  const clickable = doc.processingStatus === "READY";
  const domain = domainForDocumentType(doc.documentType);
  const body = (
    <div
      className={`group flex h-full flex-col rounded-lg border border-ink-200 bg-paper-50 p-4 transition-shadow ${
        clickable ? "hover:border-ink-300 hover:shadow-panel" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tracking-wide ${domain.tile}`}
        >
          {domain.mark}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800" title={doc.title}>
            {doc.title}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {formatDocumentType(doc.documentType)}
            <span className="text-ink-400"> · {domain.name}</span>
          </p>
        </div>
        <Badge tone={STATUS_TONE[doc.processingStatus]}>
          {doc.processingStatus === "PROCESSING" && (
            <Spinner className="h-2.5 w-2.5 text-current" />
          )}
          {STATUS_LABEL[doc.processingStatus]}
        </Badge>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-400">
        <span>
          {formatFileSize(doc.fileSizeBytes)} · {formatDate(doc.createdAt)}
          {doc.isSynthetic && " · Synthetic"}
        </span>
        {clickable ? (
          <span className="flex items-center gap-1 font-medium text-ink-600 group-hover:text-ink-900">
            Open analysis <Icon name="arrowRight" size={14} />
          </span>
        ) : doc.processingStatus === "FAILED" ? (
          <span className="text-risk-text">Could not be analysed</span>
        ) : (
          <span>Analysis in progress</span>
        )}
      </div>
    </div>
  );

  if (!clickable) {
    return <div aria-disabled="true">{body}</div>;
  }
  return (
    <Link href={`/documents/${doc.id}`} className="block h-full">
      {body}
    </Link>
  );
}
