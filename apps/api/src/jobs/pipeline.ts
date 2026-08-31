import { Prisma, getPrismaClient } from "@nyayalens/db";
import { runRuleBasedClauseClassification } from "../clauses/ruleBasedClauseClassifier.js";
import { DOCX_MIME_TYPE, PDF_MIME_TYPE, extractCanonicalText } from "../extraction/extractText.js";
import {
  GenericTransformerNerUnavailableError,
  runGenericTransformerNer,
} from "../ner/genericTransformerNer.js";
import { runRuleBasedNer } from "../ner/rulePatterns.js";
import { rasterizePdfPage } from "../ocr/rasterizePdfPage.js";
import { runOcrOnImage } from "../ocr/runOcr.js";
import { runRiskEngine } from "../risk/runRiskEngine.js";
import { getStorage } from "../storage/index.js";

const prisma = getPrismaClient();

// jobType values currently in use. Kept here (not an enum - see
// TODO_PROCESSING_JOB_TYPES in schema.prisma) so every stage name used by
// the pipeline is defined in exactly one place.
export const JOB_TYPES = {
  TEXT_EXTRACTION: "text_extraction",
  OCR: "ocr",
  RULE_BASED_NER: "rule_based_ner",
  GENERIC_TRANSFORMER_NER: "generic_transformer_ner",
  CLAUSE_CLASSIFICATION: "clause_classification",
  RISK_ENGINE: "risk_engine",
} as const;

// True when a document is deleted (e.g. DELETE /documents/:id) while its
// background pipeline is still mid-flight: the delete cascades onto that
// document's ProcessingJob rows, so a later stage's own job-status update
// hits "record not found" (P2025) or, if the document itself vanished
// before job creation, a foreign-key violation (P2003) on create. Neither
// is a real processing failure - the document the job was ever going to
// describe no longer exists to have a status - so this is not surfaced as
// a stage FAILURE (there is nothing left to mark failed).
function isDocumentGoneDuringProcessing(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2025" || err.code === "P2003")
  );
}

class DocumentGoneError extends Error {}

async function runStage(
  documentId: string,
  jobType: string,
  fn: () => Promise<void>,
): Promise<void> {
  let job;
  try {
    job = await prisma.processingJob.create({
      data: { documentId, jobType, status: "PENDING" },
    });
  } catch (err) {
    if (isDocumentGoneDuringProcessing(err)) throw new DocumentGoneError();
    throw err;
  }

  await prisma.processingJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  try {
    await fn();
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
  } catch (err) {
    try {
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    } catch (updateErr) {
      if (isDocumentGoneDuringProcessing(updateErr)) throw new DocumentGoneError();
      throw updateErr;
    }
    throw err;
  }
}

async function runTextExtractionStage(documentId: string): Promise<void> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  if (!document.storageKey || !document.mimeType) {
    throw new Error(`Document ${documentId} has no stored file to extract text from`);
  }
  if (document.mimeType !== PDF_MIME_TYPE && document.mimeType !== DOCX_MIME_TYPE) {
    throw new Error(`Unsupported mime type for extraction: ${document.mimeType}`);
  }

  const fileData = await getStorage().read(document.storageKey);
  const { canonicalText, pages } = await extractCanonicalText(document.mimeType, fileData);

  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { canonicalText },
    }),
    ...pages.map((page) =>
      prisma.documentPage.upsert({
        where: { documentId_pageNumber: { documentId, pageNumber: page.pageNumber } },
        create: {
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
          extractionMethod: page.extractionMethod,
        },
        update: {
          text: page.text,
          extractionMethod: page.extractionMethod,
        },
      }),
    ),
  ]);
}

// Runs OCR on any page text_extraction left undetermined (extraction_method
// null - see extractText.ts). No-op if every page already has native text,
// or the document is a DOCX (DOCX pages are always native - mammoth has no
// "scanned" concept). Re-joins canonicalText afterward so it reflects both
// native and newly-OCR'd pages.
async function runOcrStage(documentId: string): Promise<void> {
  const pendingPages = await prisma.documentPage.findMany({
    where: { documentId, extractionMethod: null },
    orderBy: { pageNumber: "asc" },
  });
  if (pendingPages.length === 0) return;

  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  if (document.mimeType !== PDF_MIME_TYPE || !document.storageKey) {
    throw new Error(`Cannot OCR document ${documentId}: not a stored PDF`);
  }

  const fileData = await getStorage().read(document.storageKey);

  for (const page of pendingPages) {
    const image = await rasterizePdfPage(fileData, page.pageNumber);
    const { text, confidence } = await runOcrOnImage(image);
    await prisma.documentPage.update({
      where: { id: page.id },
      data: {
        text: text.length > 0 ? text : null,
        extractionMethod: "OCR",
        ocrConfidence: confidence,
      },
    });
  }

  const allPages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
  });
  const canonicalText = allPages
    .map((p) => p.text)
    .filter((t): t is string => t !== null)
    .join("\n\n");
  await prisma.document.update({ where: { id: documentId }, data: { canonicalText } });
}

async function runRuleBasedNerStage(documentId: string): Promise<void> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const entities = runRuleBasedNer(document.canonicalText ?? "");

  await prisma.entity.deleteMany({ where: { documentId, modelSource: "RULE_BASED" } });
  if (entities.length === 0) return;

  await prisma.entity.createMany({
    data: entities.map((e) => ({
      documentId,
      label: e.label,
      text: e.text,
      textStart: e.textStart,
      textEnd: e.textEnd,
      confidence: e.confidence,
      modelName: e.modelName,
      modelSource: "RULE_BASED",
    })),
  });
}

async function runClauseClassificationStage(documentId: string): Promise<void> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const clauses = runRuleBasedClauseClassification(document.canonicalText ?? "");

  await prisma.documentClause.deleteMany({ where: { documentId, modelSource: "RULE_BASED" } });
  if (clauses.length === 0) return;

  await prisma.documentClause.createMany({
    data: clauses.map((c) => ({
      documentId,
      clauseType: c.clauseType,
      clauseNumber: c.clauseNumber,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
      confidence: c.confidence,
      modelName: c.modelName,
      modelSource: "RULE_BASED",
    })),
  });
}

// Runs the stock pretrained transformer baseline (services/ml/baseline_ner.py).
// If the ML venv isn't configured (ML_SERVICE_PYTHON unset), this stage is
// recorded as FAILED with a clear reason rather than silently skipped -
// the rest of the pipeline (rule-based NER, clause classification) still
// completes independently, since stage failures don't roll back earlier
// stages (see runStage/runExtractionPipeline).
async function runGenericTransformerNerStage(documentId: string): Promise<void> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const entities = await runGenericTransformerNer(document.canonicalText ?? "");

  await prisma.entity.deleteMany({ where: { documentId, modelSource: "GENERIC_TRANSFORMER" } });
  if (entities.length === 0) return;

  await prisma.entity.createMany({
    data: entities.map((e) => ({
      documentId,
      label: e.label,
      text: e.text,
      textStart: e.textStart,
      textEnd: e.textEnd,
      confidence: e.confidence,
      modelName: e.modelName,
      modelSource: "GENERIC_TRANSFORMER",
    })),
  });
}

// Runs every extraction-pipeline stage for a document, in order, each
// recorded as its own ProcessingJob row. A stage failure does not stop
// later independent stages (rule-based NER and clause classification
// don't depend on the generic-transformer baseline succeeding, so one
// being unavailable in a given environment shouldn't block the others) -
// each stage's own try/catch in runStage records its outcome and errors
// already caught bubble no further than this function. If the document
// itself is deleted mid-pipeline (a caller can DELETE /documents/:id
// while an earlier stage is still running), this stops quietly rather
// than surfacing a confusing "record not found" error - see
// isDocumentGoneDuringProcessing above.
export async function runExtractionPipeline(documentId: string): Promise<void> {
  try {
    await runPipelineStages(documentId);
  } catch (err) {
    if (err instanceof DocumentGoneError) {
      console.log(`Stopping pipeline for ${documentId}: document was deleted mid-processing`);
      return;
    }
    throw err;
  }
}

async function runPipelineStages(documentId: string): Promise<void> {
  await runStage(documentId, JOB_TYPES.TEXT_EXTRACTION, () => runTextExtractionStage(documentId));
  await runStage(documentId, JOB_TYPES.OCR, () => runOcrStage(documentId));
  await runStage(documentId, JOB_TYPES.RULE_BASED_NER, () => runRuleBasedNerStage(documentId));
  await runStage(documentId, JOB_TYPES.CLAUSE_CLASSIFICATION, () =>
    runClauseClassificationStage(documentId),
  );

  try {
    await runStage(documentId, JOB_TYPES.GENERIC_TRANSFORMER_NER, () =>
      runGenericTransformerNerStage(documentId),
    );
  } catch (err) {
    if (!(err instanceof GenericTransformerNerUnavailableError)) throw err;
    // Environment doesn't have the ML venv configured - already recorded
    // as a FAILED ProcessingJob with the reason; don't crash the whole
    // pipeline over an optional baseline.
  }

  // Runs last, per docs/architecture/schema.md's key_findings ordering
  // note - it consumes rule_based clauses/entities, which are already
  // final by this point regardless of whether generic_transformer_ner
  // above succeeded or not.
  await runStage(documentId, JOB_TYPES.RISK_ENGINE, () =>
    runRiskEngine(documentId).then(() => undefined),
  );
}
