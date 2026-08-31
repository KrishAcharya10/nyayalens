import { DOCX_MIME_TYPE, PDF_MIME_TYPE } from "./extractText.js";

// Detects file type from magic bytes rather than trusting the client's
// (easily spoofed) reported mimetype/filename extension. DOCX files are
// ZIP archives (PK magic); a real content-type check would open the ZIP
// and look for [Content_Types].xml, but the PK-header + ".docx"
// extension pairing is a reasonable, low-cost check for this project's
// threat model (authenticated users uploading their own documents).
export function sniffMimeType(buffer: Buffer, originalFilename: string): string | null {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return PDF_MIME_TYPE;
  }
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isZip && originalFilename.toLowerCase().endsWith(".docx")) {
    return DOCX_MIME_TYPE;
  }
  return null;
}
