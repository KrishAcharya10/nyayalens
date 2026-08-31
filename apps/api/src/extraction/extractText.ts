import { extractDocxText } from "./docxExtractor.js";
import { extractPdfText, pageHasUsableText } from "./pdfExtractor.js";

export const PDF_MIME_TYPE = "application/pdf";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported file type: ${mimeType}`);
  }
}

export interface ExtractedPage {
  pageNumber: number;
  // null = no usable native text on this page yet (a scanned/image-only
  // PDF page) - Phase 4A's OCR stage fills this in.
  text: string | null;
  extractionMethod: "NATIVE" | null;
}

export interface ExtractionResult {
  // Native-text pages joined in order. Pages still pending OCR contribute
  // nothing here yet - once OCR fills them in, a later stage re-joins the
  // full text (see docs/architecture/document_ingestion.md).
  canonicalText: string;
  pages: ExtractedPage[];
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export async function extractCanonicalText(
  mimeType: string,
  data: Buffer,
): Promise<ExtractionResult> {
  if (mimeType === PDF_MIME_TYPE) {
    const { pages: rawPages } = await extractPdfText(data);
    const pages: ExtractedPage[] = rawPages.map((raw) => {
      const usable = pageHasUsableText(raw.text);
      return {
        pageNumber: raw.pageNumber,
        text: usable ? normalizeWhitespace(raw.text) : null,
        extractionMethod: usable ? "NATIVE" : null,
      };
    });
    const canonicalText = pages
      .map((p) => p.text)
      .filter((t): t is string => t !== null)
      .join("\n\n");
    return { canonicalText, pages };
  }

  if (mimeType === DOCX_MIME_TYPE) {
    const { text } = await extractDocxText(data);
    const normalized = normalizeWhitespace(text);
    return {
      canonicalText: normalized,
      pages: [{ pageNumber: 1, text: normalized, extractionMethod: "NATIVE" }],
    };
  }

  throw new UnsupportedFileTypeError(mimeType);
}
