import { getPrismaClient } from "@nyayalens/db";
import { enqueue } from "./queue.js";
import { runExtractionPipeline } from "./pipeline.js";

const prisma = getPrismaClient();

// Runs once at server startup. The in-process queue (jobs/queue.ts) has no
// memory across restarts, so any job left PENDING or RUNNING in Postgres
// means the process was killed mid-pipeline. Mark those interrupted, then
// re-run the pipeline for the affected documents - extraction is safe to
// re-run (DocumentPage upserts by [documentId, pageNumber]).
export async function recoverInterruptedJobs(): Promise<void> {
  const interrupted = await prisma.processingJob.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, documentId: true },
  });

  if (interrupted.length === 0) return;

  const documentIds = [...new Set(interrupted.map((j) => j.documentId))];

  await prisma.processingJob.updateMany({
    where: { id: { in: interrupted.map((j) => j.id) } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: "Interrupted by server restart",
    },
  });

  console.log(
    `[recovery] Found ${interrupted.length} interrupted job(s) across ${documentIds.length} document(s); re-running extraction pipeline for each.`,
  );

  for (const documentId of documentIds) {
    enqueue(() =>
      runExtractionPipeline(documentId).catch((err: unknown) => {
        console.error(`[recovery] Re-run failed for document ${documentId}:`, err);
      }),
    );
  }
}
