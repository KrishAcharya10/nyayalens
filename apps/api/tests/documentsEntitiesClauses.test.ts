import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const prisma = getPrismaClient();

const PDF_FIXTURE = path.resolve(__dirname, "fixtures/sample_residential_rental.pdf");

const createdEmails: string[] = [];

afterAll(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await prisma.$disconnect();
});

async function registerUser(): Promise<{ email: string; accessToken: string }> {
  const email = `test-entities-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email, accessToken: res.body.accessToken as string };
}

interface JobStatus {
  jobType: string;
  status: string;
}

async function waitForJob(
  accessToken: string,
  documentId: string,
  jobType: string,
  timeoutMs = 15000,
): Promise<JobStatus> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    const jobs = res.body.document?.processingJobs as JobStatus[] | undefined;
    const job = jobs?.find((j) => j.jobType === jobType);
    if (job && (job.status === "SUCCEEDED" || job.status === "FAILED")) {
      return job;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for job ${jobType} on document ${documentId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("entities and clauses endpoints (Phase 4A)", () => {
  it("extracts rule-based entities and clauses for an uploaded document", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;

    const nerJob = await waitForJob(user.accessToken, documentId, "rule_based_ner");
    expect(nerJob.status).toBe("SUCCEEDED");
    const clauseJob = await waitForJob(user.accessToken, documentId, "clause_classification");
    expect(clauseJob.status).toBe("SUCCEEDED");

    const entitiesRes = await request(app)
      .get(`/documents/${documentId}/entities`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(entitiesRes.status).toBe(200);
    expect(entitiesRes.body.entities.length).toBeGreaterThan(0);
    expect(
      entitiesRes.body.entities.some(
        (e: { modelSource: string }) => e.modelSource === "RULE_BASED",
      ),
    ).toBe(true);
    expect(entitiesRes.body.entities.some((e: { label: string }) => e.label === "RENT")).toBe(true);

    const clausesRes = await request(app)
      .get(`/documents/${documentId}/clauses`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(clausesRes.status).toBe(200);
    expect(clausesRes.body.clauses.length).toBeGreaterThan(0);
    expect(
      clausesRes.body.clauses.some((c: { clauseType: string }) => c.clauseType === "RENT_PAYMENT"),
    ).toBe(true);
  });

  // Slow (spawns Python + reloads the transformer model from disk each
  // run) and environment-dependent - only runs when ML_SERVICE_PYTHON is
  // configured (see services/ml/README.md). Skipped, not silently
  // passed, when it isn't - see the .skipIf below.
  it.skipIf(!env.ML_SERVICE_PYTHON)(
    "runs the generic-transformer baseline and tags its output distinctly from rule-based",
    async () => {
      const user = await registerUser();
      const upload = await request(app)
        .post("/documents")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .field("documentType", "residential_rental")
        .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
      const documentId = upload.body.id as string;

      const job = await waitForJob(user.accessToken, documentId, "generic_transformer_ner", 60000);
      expect(job.status).toBe("SUCCEEDED");

      const entitiesRes = await request(app)
        .get(`/documents/${documentId}/entities`)
        .set("Authorization", `Bearer ${user.accessToken}`);
      const genericEntities = entitiesRes.body.entities.filter(
        (e: { modelSource: string }) => e.modelSource === "GENERIC_TRANSFORMER",
      );
      expect(genericEntities.length).toBeGreaterThan(0);
      // Labels are the model's own vocabulary (GENERIC_PER/LOC/...), never
      // silently relabeled into the domain ontology - see
      // services/ml/baseline_ner.py.
      expect(genericEntities.every((e: { label: string }) => e.label.startsWith("GENERIC_"))).toBe(
        true,
      );
    },
    60000,
  );

  it("does not let a user read another user's entities or clauses", async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;
    await waitForJob(owner.accessToken, documentId, "rule_based_ner");

    const entitiesAsOther = await request(app)
      .get(`/documents/${documentId}/entities`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(entitiesAsOther.status).toBe(404);

    const clausesAsOther = await request(app)
      .get(`/documents/${documentId}/clauses`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(clausesAsOther.status).toBe(404);
  });

  it("rejects unauthenticated requests for entities and clauses", async () => {
    const entitiesRes = await request(app).get(
      "/documents/00000000-0000-0000-0000-000000000000/entities",
    );
    expect(entitiesRes.status).toBe(401);
    const clausesRes = await request(app).get(
      "/documents/00000000-0000-0000-0000-000000000000/clauses",
    );
    expect(clausesRes.status).toBe(401);
  });
});
