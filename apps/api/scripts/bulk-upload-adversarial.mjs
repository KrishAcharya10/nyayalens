// Uploads every document in research/data/adversarial/ through the live API
// (full pipeline, including risk_engine - Phase 6) under a dedicated eval
// account, then tags each row isAdversarial/isAdversarialControl directly
// via Prisma. These flags are intentionally NOT exposed on the public
// POST /documents schema (an ordinary uploader should never be able to set
// them) so this script sets them out-of-band, the same way
// backfill-rule-based-ner.mjs reaches into the DB directly rather than
// going through an endpoint that has no reason to exist publicly.
//
// Writes upload_manifest.jsonl mapping each generator doc_id to its
// persisted DB document id, category, is_control and expected_flag, so
// evaluate-adversarial.mjs doesn't need to re-derive that from titles.
//
// Idempotent: reuses a fixed eval account (credentials cached git-ignored,
// see CREDENTIALS_PATH) and skips any doc_id already uploaded under it.
//
// Usage (from apps/api - imports TypeScript source via tsx):
//   dotenv -e ../../.env -- tsx scripts/bulk-upload-adversarial.mjs
// Requires the API server running (npm run dev:api) and a reachable DB.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";

const prisma = getPrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADVERSARIAL_DIR = path.resolve(__dirname, "../../../research/data/adversarial");
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const CREDENTIALS_PATH = path.resolve(__dirname, "../.phase6-adversarial-eval-credentials.json");
const EVAL_EMAIL = "phase6-adversarial-eval@nyayalens.local";

function loadManifest() {
  const lines = readFileSync(path.join(ADVERSARIAL_DIR, "adversarial_manifest.jsonl"), "utf-8")
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
  const filePath = path.join(ADVERSARIAL_DIR, entry.files.pdf);
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
  const targetJobTypes = [
    "text_extraction",
    "rule_based_ner",
    "clause_classification",
    "risk_engine",
  ];
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
    `[bulk-upload-adversarial] ${manifest.length} documents in manifest, ${existingTitles.size} already uploaded, ${toUpload.length} to upload`,
  );

  const uploadManifestEntries = [];
  let succeeded = 0;
  let failed = 0;
  const started = Date.now();

  for (let i = 0; i < toUpload.length; i++) {
    const entry = toUpload[i];
    try {
      const uploaded = await uploadDocument(accessToken, entry);
      const jobs = await waitForPipeline(accessToken, uploaded.id);
      // generic_transformer_ner is excluded the same way bulk-upload-synthetic.mjs
      // excludes it - a known, pre-existing Phase 4A/4B limitation (not in scope
      // to fix here), and risk_engine never depends on its output anyway.
      const failedStages = jobs.filter(
        (j) => j.status === "FAILED" && j.jobType !== "generic_transformer_ner",
      );
      if (failedStages.length > 0) {
        console.error(
          `[bulk-upload-adversarial] ${entry.doc_id}: stage failure(s): ${failedStages.map((j) => j.jobType).join(",")}`,
        );
        failed++;
      } else {
        succeeded++;
      }
      await prisma.document.update({
        where: { id: uploaded.id },
        data: { isAdversarial: true, isAdversarialControl: entry.is_control },
      });
      uploadManifestEntries.push({
        doc_id: entry.doc_id,
        document_id: uploaded.id,
        category: entry.category,
        is_control: entry.is_control,
        expected_flag: entry.expected_flag,
      });
    } catch (err) {
      console.error(
        `[bulk-upload-adversarial] ${entry.doc_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
    if ((i + 1) % 25 === 0 || i === toUpload.length - 1) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[bulk-upload-adversarial] ${i + 1}/${toUpload.length} processed (${elapsed}s elapsed)`,
      );
    }
  }

  // Reconcile doc_ids that were already uploaded in a prior (interrupted)
  // run so upload_manifest.jsonl is always complete, not just this run's delta.
  if (existingTitles.size > 0) {
    const alreadyUploadedDocIds = manifest
      .filter((e) => existingTitles.has(e.doc_id))
      .map((e) => e.doc_id);
    const alreadyDocs = await prisma.document.findMany({
      where: { owner: { email: EVAL_EMAIL }, title: { in: alreadyUploadedDocIds } },
      select: { id: true, title: true },
    });
    const byTitle = new Map(alreadyDocs.map((d) => [d.title, d.id]));
    for (const entry of manifest) {
      if (existingTitles.has(entry.doc_id) && byTitle.has(entry.doc_id)) {
        uploadManifestEntries.push({
          doc_id: entry.doc_id,
          document_id: byTitle.get(entry.doc_id),
          category: entry.category,
          is_control: entry.is_control,
          expected_flag: entry.expected_flag,
        });
      }
    }
  }

  writeFileSync(
    path.join(ADVERSARIAL_DIR, "upload_manifest.jsonl"),
    uploadManifestEntries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "utf-8",
  );

  console.log(
    `\n[bulk-upload-adversarial] Done. ${succeeded} succeeded, ${failed} failed, ${existingTitles.size} already present. upload_manifest.jsonl has ${uploadManifestEntries.length} entries.`,
  );
  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("[bulk-upload-adversarial] Fatal error:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
