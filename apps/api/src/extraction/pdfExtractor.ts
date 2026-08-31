import { createRequire } from "node:module";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs-dist warns ("Ensure that the `standardFontDataUrl` API parameter
// is provided") and falls back to less accurate glyph metrics for PDFs
// that reference standard (non-embedded) fonts unless this is set. Its
// Node build reads this as a filesystem path (not a file:// URL, which
// its Node fetch shim can't load) - point it at the font data pdfjs-dist
// ships in its own package.
const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPageText[];
}

interface PdfTextItem {
  str?: string;
  // pdfjs sets this when the text layout implies a line break after this
  // item. Without honoring it, joining every item with a single space
  // flattens the whole page onto one line - fine for keyword search, but
  // it destroys the paragraph/heading structure clause segmentation
  // (Phase 4A) depends on. See docs/architecture/extraction_pipeline.md.
  hasEOL?: boolean;
}

// A page below this many non-whitespace characters is treated as having no
// usable native text (a scanned/image-only page) - see
// docs/architecture/document_ingestion.md for why this is a Phase 3/4A
// boundary rather than a single extraction step.
export const MIN_CHARS_FOR_NATIVE_TEXT = 30;

export function pageHasUsableText(text: string): boolean {
  return text.trim().length >= MIN_CHARS_FOR_NATIVE_TEXT;
}

export async function extractPdfText(data: Buffer): Promise<PdfExtractionResult> {
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items as PdfTextItem[]) {
        text += (item.str ?? "") + (item.hasEOL ? "\n" : " ");
      }
      pages.push({ pageNumber, text });
    }
  } finally {
    await pdf.destroy();
  }

  return { pages };
}
