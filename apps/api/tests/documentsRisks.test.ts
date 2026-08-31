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
  const email = `test-risks-${randomUUID()}@nyayalens.local`;
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

async function waitForRiskEngine(
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
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for risk_engine on ${documentId}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("GET /documents/:id/risks (Phase 6)", () => {
  it("runs the risk engine end-to-end through the real pipeline and returns a well-formed response", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;

    await waitForRiskEngine(user.accessToken, documentId);

    const res = await request(app)
      .get(`/documents/${documentId}/risks`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.risks)).toBe(true);
    for (const risk of res.body.risks) {
      expect([
        "LIABILITY_SHIFT",
        "ASYMMETRIC_OBLIGATION",
        "UNBOUNDED_DISCRETION",
        "LAND_USE_CONTRADICTION",
        "MISSING_CLAUSE",
      ]).toContain(risk.category);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(risk.severity);
      expect(["PASS_1", "PASS_2"]).toContain(risk.pass);
      expect(risk.modelSource).toBe("RULE_BASED");
      expect(Array.isArray(risk.evidence)).toBe(true);
      expect(typeof risk.reason).toBe("string");
    }
  });

  it("does not let a user read another user's risks", async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;
    await waitForRiskEngine(owner.accessToken, documentId);

    const res = await request(app)
      .get(`/documents/${documentId}/risks`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/00000000-0000-0000-0000-000000000000/risks");
    expect(res.status).toBe(401);
  });
});
