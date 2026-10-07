// Uploads every document in research/data/synthetic/ through the live API
// (text_extraction, rule_based_ner, clause_classification - NOT
// generic_transformer_ner, which is backfilled separately and much faster
// in bulk; see services/ml/backfill_generic_transformer.py) so Phase 4B's
// evaluation has real, pipeline-produced predictions to score against
// ground truth, not just the metadata-only rows the Phase 1-2 seed script
// creates.
//
// Idempotent: reuses a fixed evaluation account (credentials cached
// git-ignored, see CREDENTIALS_PATH) and skips any doc_id already
// uploaded under it, so a re-run after an interruption only uploads what's
// missing.
//
// Usage: node scripts/bulk-upload-synthetic.mjs
// Requires the API server running (npm run dev:api) and a reachable DB.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// NYAYALENS_SYNTHETIC_DIR selects another dataset with the same layout
// (e.g. research/data/synthetic_v2 from generate_batch_v2.py).
const SYNTHETIC_DIR = process.env.NYAYALENS_SYNTHETIC_DIR
  ? path.resolve(process.env.NYAYALENS_SYNTHETIC_DIR)
  : path.resolve(__dirname, "../../../research/data/synthetic");
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const CREDENTIALS_PATH = path.resolve(__dirname, "../.phase4b-eval-credentials.json");
const EVAL_EMAIL = "phase4b-eval@nyayalens.local";

function loadManifest() {
  const lines = readFileSync(path.join(SYNTHETIC_DIR, "manifest.jsonl"), "utf-8")
    .trim()
    .split("\n");
  return lines.map((l) => JSON.parse(l));
}

async function getOrCreateEvalUser() {
  if (existsSync(CREDENTIALS_PATH)) {
    const { email, password } = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 200) {
      const body = await res.json();
      return body.accessToken;
    }
  }

  const password = randomBytes(24).toString("base64url");
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EVAL_EMAIL, password }),
  });
  if (res.status !== 201) {
    throw new Error(`Could not register or log in the eval account (HTTP ${res.status})`);
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({ email: EVAL_EMAIL, password }), "utf-8");
  const body = await res.json();
  return body.accessToken;
}

async function listExistingTitles(accessToken) {
  const res = await fetch(`${API_BASE_URL}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { documents } = await res.json();
  return new Set(documents.map((d) => d.title));
}

async function uploadDocument(accessToken, entry) {
  const filePath = path.join(SYNTHETIC_DIR, entry.files.pdf);
  const fileBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append("documentType", entry.document_type);
  form.append("title", entry.doc_id);
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
    if (done) return jobs;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for pipeline on ${documentId}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  const manifest = loadManifest();
  const accessToken = await getOrCreateEvalUser();
  const existingTitles = await listExistingTitles(accessToken);

  const toUpload = manifest.filter((entry) => !existingTitles.has(entry.doc_id));
  console.log(
    `[bulk-upload] ${manifest.length} documents in manifest, ${existingTitles.size} already uploaded, ${toUpload.length} to upload`,
  );

  let succeeded = 0;
  let failed = 0;
  const started = Date.now();

  for (let i = 0; i < toUpload.length; i++) {
    const entry = toUpload[i];
    try {
      const uploaded = await uploadDocument(accessToken, entry);
      const jobs = await waitForPipeline(accessToken, uploaded.id);
      const failedStages = jobs.filter(
        (j) => j.status === "FAILED" && j.jobType !== "generic_transformer_ner",
      );
      if (failedStages.length > 0) {
        console.error(
          `[bulk-upload] ${entry.doc_id}: stage failure(s): ${failedStages.map((j) => j.jobType).join(",")}`,
        );
        failed++;
      } else {
        succeeded++;
      }
    } catch (err) {
      console.error(
        `[bulk-upload] ${entry.doc_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
    if ((i + 1) % 25 === 0 || i === toUpload.length - 1) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[bulk-upload] ${i + 1}/${toUpload.length} processed (${elapsed}s elapsed)`);
    }
  }

  console.log(
    `\n[bulk-upload] Done. ${succeeded} succeeded, ${failed} failed, ${existingTitles.size} already present.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[bulk-upload] Fatal error:", err);
  process.exitCode = 1;
});
