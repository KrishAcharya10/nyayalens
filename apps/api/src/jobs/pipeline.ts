import { getPrismaClient } from "@nyayalens/db";
import { DOCX_MIME_TYPE, PDF_MIME_TYPE, extractCanonicalText } from "../extraction/extractText.js";
import { getStorage } from "../storage/index.js";

const prisma = getPrismaClient();

// jobType values currently in use. Kept here (not an enum - see
// TODO_PROCESSING_JOB_TYPES in schema.prisma) so every stage name used by
// the pipeline is defined in exactly one place.
export const JOB_TYPES = {
  TEXT_EXTRACTION: "text_extraction",
} as const;

async function runStage(
  documentId: string,
  jobType: string,
  fn: () => Promise<void>,
): Promise<void> {
  const job = await prisma.processingJob.create({
    data: { documentId, jobType, status: "PENDING" },
  });
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
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
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

// Runs every extraction-pipeline stage for a document, in order, each
// recorded as its own ProcessingJob row. Stops (without running later
// stages) if a stage fails - a partially-extracted document is left in a
// state a human or the recovery job can inspect via ProcessingJob rows,
// never silently marked done.
export async function runExtractionPipeline(documentId: string): Promise<void> {
  await runStage(documentId, JOB_TYPES.TEXT_EXTRACTION, () => runTextExtractionStage(documentId));
}
