// Phase 7B: GET /documents/summary - purely additive, composes Document +
// ProcessingJob rows into a per-document processingStatus so the frontend
// document list doesn't need an N+1 fetch. Does not touch GET /documents.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

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

async function registerUser(): Promise<{ accessToken: string }> {
  const email = `test-summary-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { accessToken: res.body.accessToken as string };
}

interface JobStatus {
  jobType: string;
  status: string;
}

async function waitForPipeline(
  accessToken: string,
  documentId: string,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    const jobs = res.body.document?.processingJobs as JobStatus[] | undefined;
    const job = jobs?.find((j) => j.jobType === "risk_engine");
    if (job && (job.status === "SUCCEEDED" || job.status === "FAILED")) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for pipeline on ${documentId}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("GET /documents/summary (Phase 7B)", () => {
  it("reports processingStatus: READY once the required pipeline stages succeed, alongside the same base fields as GET /documents", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;
    await waitForPipeline(user.accessToken, documentId);

    const res = await request(app)
      .get("/documents/summary")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    const summary = (res.body.documents as { id: string }[]).find((d) => d.id === documentId);
    expect(summary).toBeDefined();
    expect(summary).toMatchObject({
      id: documentId,
      documentType: "RESIDENTIAL_RENTAL",
      isSynthetic: false,
      processingStatus: "READY",
    });
    expect(typeof summary!.title).toBe("string");
    expect(typeof summary!.fileSizeBytes).toBe("number");
  });

  it("only returns the caller's own documents", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;

    const res = await request(app)
      .get("/documents/summary")
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(res.status).toBe(200);
    expect((res.body.documents as { id: string }[]).some((d) => d.id === documentId)).toBe(false);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/summary");
    expect(res.status).toBe(401);
  });
});
