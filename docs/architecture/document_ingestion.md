# Document ingestion (Phase 3)

Covers upload, storage, async processing, and canonical-text extraction.
NER, clause classification, and OCR execution belong to Phase 4A (they
consume this phase's output) - see `extraction_pipeline.md`.

## Upload

`POST /documents` (multipart/form-data, `requireAuth`):

- `file` - the uploaded `.pdf` or `.docx`. Type is verified from magic
  bytes (`apps/api/src/extraction/sniffFileType.ts`), not the client's
  reported MIME type or filename extension, which are both spoofable.
  A ZIP-signature file is only accepted as DOCX if its filename also ends
  `.docx` (a full `[Content_Types].xml` check would be more rigorous but
  isn't implemented - documented limitation, low risk for this project's
  threat model of authenticated users uploading their own documents).
- `documentType` - `residential_rental` or `land_lease` (required).
- `title` - optional; defaults to the original filename.
- Size capped at `MAX_UPLOAD_SIZE_MB` (default 20; multer memory storage).

On success: creates a `Document` row, saves the raw file via the storage
adapter, records `storageKey`/`mimeType`/`fileSizeBytes`, enqueues the
extraction pipeline in the background, and responds `201` immediately -
the response does not wait for extraction. Poll `GET /documents/:id` (or
`GET /documents/:id`'s `processingJobs`) for status.

## Storage adapter

`apps/api/src/storage/` - a minimal `StorageAdapter` interface
(`save`/`read`/`delete`) with one implementation, `LocalDiskStorage`,
rooted at `STORAGE_ROOT` (default `apps/api/storage/`, git-ignored).
Files are keyed `${ownerId}/${documentId}.${ext}`. Swapping in an
object-store adapter (S3, etc.) later means implementing the same
interface and changing `storage/index.ts`'s factory - no call site
changes.

## Async processing: in-process pipeline, not a distributed queue

There is no Redis/message broker in this environment (see the Phase 1-2
report's deviations). `apps/api/src/jobs/queue.ts` is a same-process,
sequential, in-memory task queue - `enqueue()` pushes a task, an internal
drain loop runs tasks one at a time. This is a deliberate, documented
trade-off:

- **Pro**: zero extra infrastructure to run or fail; correct for a single
  API instance, which is what this project runs.
- **Con**: not horizontally scalable (all jobs run in whichever process
  called `enqueue`), and the queue itself has no memory across a process
  restart.

The second con is mitigated by `apps/api/src/jobs/recovery.ts`, run once
at server startup (`index.ts`): any `ProcessingJob` left `PENDING` or
`RUNNING` in Postgres (meaning the process was killed mid-pipeline) is
marked `FAILED` ("Interrupted by server restart") and the extraction
pipeline is re-run for that document. Re-running is safe because
`DocumentPage` writes are upserts keyed on `[documentId, pageNumber]`.

Each pipeline stage is its own `ProcessingJob` row
(`PENDING` -> `RUNNING` -> `SUCCEEDED`/`FAILED`, with `startedAt`/
`finishedAt`/`errorMessage`), so status is always inspectable via
`GET /documents/:id` regardless of which process ran it. If a stage
throws, the pipeline stops (later stages do not run) rather than
continuing over a failure - see `jobs/pipeline.ts#runStage`.

Phase 3 registers one stage, `jobType: "text_extraction"`. Phase 4A adds
`ocr`, `rule_based_ner`, `generic_transformer_ner`, `clause_classification`
stages to the same pipeline (see `extraction_pipeline.md`).

## Text extraction

`apps/api/src/extraction/`:

- **PDF** (`pdfExtractor.ts`): `pdfjs-dist`'s legacy Node build,
  per-page `getTextContent()`. `standardFontDataUrl` is pointed at the
  font data pdfjs-dist ships, as a filesystem path (its Node fetch shim
  can't load a `file://` URL) - without this it silently falls back to
  less accurate glyph metrics for PDFs using standard (non-embedded)
  fonts.
- **DOCX** (`docxExtractor.ts`): `mammoth`'s `extractRawText`. DOCX has
  no reliable native page-break signal without full layout rendering
  (page breaks depend on font metrics and margins mammoth doesn't
  compute), so every DOCX is persisted as a single `DocumentPage`
  (`pageNumber: 1`) - a real, documented limitation, not an oversight.

## The native-text-vs-OCR boundary (Phase 3 stops here; Phase 4A starts)

A PDF page's extracted text is checked against `MIN_CHARS_FOR_NATIVE_TEXT`
(30 non-whitespace characters). Above the threshold: the page gets
`extractionMethod: "NATIVE"` and its text. At or below it (a
scanned/image-only page, or a genuinely near-empty page): the page is
persisted with `text: null`, `extractionMethod: null` - explicitly
**left undetermined**, not silently treated as empty or as extraction
failure. `Document.canonicalText` is the join of only the pages that do
have native text; pages pending OCR contribute nothing to it yet.

This is intentional and tested (`documents.test.ts`, "leaves a page with
no usable native text unset"): Phase 3's job is to determine what can be
extracted natively and clearly flag what can't, not to guess or to run
OCR itself. Phase 4A's OCR stage is the only thing that ever sets
`extractionMethod: "OCR"`.

## Retrieval / deletion

- `GET /documents` - the caller's own documents (list).
- `GET /documents/:id` - one document with its pages and processing-job
  history; `404` (not `403`) if it doesn't belong to the caller, to avoid
  confirming a document id exists for someone who doesn't own it.
- `DELETE /documents/:id` - deletes the storage file (if any) and the
  `Document` row (cascades to pages/jobs/entities/clauses/etc. via the
  schema's `onDelete: Cascade`).

All three enforce `ownerId = req.auth.userId`, the same pattern Phase 1-2
established.

## New schema in this phase

Migration `20260831042134_phase3_4a_extraction` (Phase 3 + 4A combined,
see `extraction_pipeline.md` for the 4A half):

- `documents.storage_key` / `mime_type` / `file_size_bytes` (nullable -
  null for rows with no uploaded file, e.g. synthetic seed metadata).
- `document_pages.extraction_method` (nullable enum `NATIVE`/`OCR`) and
  `document_pages.ocr_confidence` (nullable, only meaningful once OCR
  runs).
