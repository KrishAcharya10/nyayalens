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
  const email = `test-ask-${randomUUID()}@nyayalens.local`;
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

async function uploadAndProcess(accessToken: string): Promise<string> {
  const upload = await request(app)
    .post("/documents")
    .set("Authorization", `Bearer ${accessToken}`)
    .field("documentType", "residential_rental")
    .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
  const documentId = upload.body.id as string;
  await waitForPipeline(accessToken, documentId);
  return documentId;
}

describe("POST /documents/:id/ask (Phase 7A)", () => {
  it("answers a factual question grounded in the document's own clauses, with real provenance", async () => {
    const user = await registerUser();
    const documentId = await uploadAndProcess(user.accessToken);

    const res = await request(app)
      .post(`/documents/${documentId}/ask`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ question: "What is the security deposit amount?" });

    expect(res.status).toBe(200);
    expect(typeof res.body.answer).toBe("string");
    expect(res.body.grounded).toBe(true);
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(res.body.sources.length).toBeGreaterThan(0);
    for (const source of res.body.sources) {
      expect(source.documentId).toBeDefined();
      expect(typeof source.excerpt).toBe("string");
    }
  });

  it("returns grounded:false rather than a fabricated answer for a genuinely unanswerable question", async () => {
    const user = await registerUser();
    const documentId = await uploadAndProcess(user.accessToken);

    const res = await request(app)
      .post(`/documents/${documentId}/ask`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        question: "What is the penalty for keeping an unregistered pet parrot in the flat?",
      });

    expect(res.status).toBe(200);
    expect(res.body.grounded).toBe(false);
    expect(res.body.sources).toEqual([]);
  });

  it("rejects a missing/empty question", async () => {
    const user = await registerUser();
    const documentId = await uploadAndProcess(user.accessToken);

    const res = await request(app)
      .post(`/documents/${documentId}/ask`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ question: "" });
    expect(res.status).toBe(400);
  });

  it("does not let a user ask about another user's document", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const documentId = await uploadAndProcess(owner.accessToken);

    const res = await request(app)
      .post(`/documents/${documentId}/ask`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ question: "What is the rent?" });
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/documents/00000000-0000-0000-0000-000000000000/ask")
      .send({ question: "What is the rent?" });
    expect(res.status).toBe(401);
  });
});
