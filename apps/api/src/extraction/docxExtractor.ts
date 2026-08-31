import mammoth from "mammoth";

export interface DocxExtractionResult {
  text: string;
}

// DOCX has no reliable native page-break signal without full layout
// rendering (page breaks depend on font metrics, margins, etc. that
// mammoth's raw-text extraction does not compute) - see
// docs/architecture/document_ingestion.md. Callers persist this as a
// single page.
export async function extractDocxText(data: Buffer): Promise<DocxExtractionResult> {
  const result = await mammoth.extractRawText({ buffer: data });
  return { text: result.value };
}
