// In-process background task queue. There is no Redis/message broker in
// this environment, so this deliberately trades scalability and
// cross-process durability for zero extra infrastructure - documented as
// a known limitation in docs/architecture/document_ingestion.md. Job
// *state* still lives in Postgres (ProcessingJob rows); this queue only
// decides when the in-memory handler for a job actually runs, and
// `recoverInterruptedJobs` (jobs/recovery.ts) re-enqueues anything left
// PENDING/RUNNING after a restart.
type Task = () => Promise<void>;

const queue: Task[] = [];
let draining = false;

export function enqueue(task: Task): void {
  queue.push(task);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) continue;
      try {
        await task();
      } catch (err) {
        console.error("Background job failed:", err);
      }
    }
  } finally {
    draining = false;
  }
}
