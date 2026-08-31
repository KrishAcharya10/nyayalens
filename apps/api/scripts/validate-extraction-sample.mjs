// Phase 4A pipeline-correctness validation: uploads a sample of real
// synthetic documents through the live API and confirms the extraction
// pipeline (text extraction, rule-based NER, clause classification -
// generic-transformer is intentionally excluded here, see README) runs
// to completion without errors.
//
// This is NOT an evaluation - it does not compute or print precision/
// recall/F1 against ground truth (that's Phase 4B, using k-fold CV; see
// docs/architecture/evaluation_results.md). It only proves the pipeline
// runs correctly end-to-end on real generated documents, per the Phase 4A
// Definition of Done. Every printed count is a plain pipeline-output
// count, not a research metric.
//
// Usage: node scripts/validate-extraction-sample.mjs [sampleSizePerType]
// Requires the API server running (npm run dev:api) and a reachable DB.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHETIC_DIR = path.resolve(__dirname, "../../../research/data/synthetic");
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const SAMPLE_SIZE_PER_TYPE = Number(process.argv[2] ?? 10);

function loadManifestSample() {
  const lines = readFileSync(path.join(SYNTHETIC_DIR, "manifest.jsonl"), "utf-8")
    .trim()
    .split("\n");
  const entries = lines.map((l) => JSON.parse(l));
  const residential = entries
    .filter((e) => e.document_type === "residential_rental")
    .slice(0, SAMPLE_SIZE_PER_TYPE);
  const landLease = entries
    .filter((e) => e.document_type === "land_lease")
    .slice(0, SAMPLE_SIZE_PER_TYPE);
  return [...residential, ...landLease];
}

async function registerValidationUser() {
  const email = `phase4a-validation-${Date.now()}@nyayalens.local`;
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery-staple" }),
  });
  const body = await res.json();
  return { email, accessToken: body.accessToken };
}

async function uploadDocument(accessToken, entry) {
  const filePath = path.join(SYNTHETIC_DIR, entry.files.pdf);
  const fileBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append("documentType", entry.document_type);
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), entry.files.pdf);

  const res = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (res.status !== 201) {
    throw new Error(`Upload failed for ${entry.doc_id}: HTTP ${res.status}`);
  }
  return res.json();
}

async function waitForPipeline(accessToken, documentId, timeoutMs = 20000) {
  const targetJobTypes = ["text_extraction", "rule_based_ner", "clause_classification"];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { document } = await res.json();
    const jobs = document.processingJobs ?? [];
    const done = targetJobTypes.every((t) =>
      jobs.some((j) => j.jobType === t && (j.status === "SUCCEEDED" || j.status === "FAILED")),
    );
    if (done) return { document, jobs };
    if (Date.now() > deadline) throw new Error(`Timed out waiting for pipeline on ${documentId}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const sample = loadManifestSample();
  console.log(
    `[validation] Sample size: ${sample.length} documents (${SAMPLE_SIZE_PER_TYPE} per type)`,
  );
  console.log("[validation] This is a pipeline-correctness check, not a research evaluation.\n");

  const { accessToken } = await registerValidationUser();

  const results = [];
  for (const entry of sample) {
    const started = Date.now();
    try {
      const uploaded = await uploadDocument(accessToken, entry);
      const { jobs } = await waitForPipeline(accessToken, uploaded.id);
      // generic_transformer_ner is expected to fail here unless
      // ML_SERVICE_PYTHON is configured for the server this script talks
      // to - it's optional and excluded from the pass/fail verdict (see
      // file header).
      const failedJobs = jobs.filter(
        (j) => j.status === "FAILED" && j.jobType !== "generic_transformer_ner",
      );
      const entitiesRes = await fetch(`${API_BASE_URL}/documents/${uploaded.id}/entities`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const clausesRes = await fetch(`${API_BASE_URL}/documents/${uploaded.id}/clauses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const { entities } = await entitiesRes.json();
      const { clauses } = await clausesRes.json();
      results.push({
        docId: entry.doc_id,
        documentType: entry.document_type,
        ok: failedJobs.length === 0,
        failedJobTypes: failedJobs.map((j) => j.jobType),
        entityCount: entities.length,
        clauseCount: clauses.length,
        ms: Date.now() - started,
      });
    } catch (err) {
      results.push({
        docId: entry.doc_id,
        documentType: entry.document_type,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("[validation] Per-document results:");
  for (const r of results) {
    const status = r.ok ? "OK" : "FAILED";
    console.log(
      `  ${status}  ${r.docId} (${r.documentType})  entities=${r.entityCount ?? "-"} clauses=${r.clauseCount ?? "-"} ${r.ms}ms${r.error ? `  error=${r.error}` : ""}${r.failedJobTypes?.length ? `  failedStages=${r.failedJobTypes.join(",")}` : ""}`,
    );
  }

  console.log(
    `\n[validation] ${succeeded.length}/${results.length} documents completed the pipeline (text_extraction, rule_based_ner, clause_classification) without a stage failure.`,
  );
  if (failed.length > 0) {
    console.log(`[validation] ${failed.length} document(s) had a failure - see above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[validation] Fatal error:", err);
  process.exitCode = 1;
});
