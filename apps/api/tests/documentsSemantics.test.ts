import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

// End-to-end through the real pipeline: a synthetic v3 agreement to sell
// (research/data/synthetic_v3, adversarial pair 0012) whose consideration
// clause says Rs. 23,70,000 while its schedule says Rs. 33,70,000.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "fixtures/sample_sale_agreement_contradiction.pdf");
const app = createApp();
const prisma = getPrismaClient();
const createdEmails: string[] = [];

async function registerUser() {
  const email = `test-semantics-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return res.body.accessToken as string;
}

async function waitForPipeline(token: string, id: string, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/documents/${id}`).set("Authorization", `Bearer ${token}`);
    const jobs = res.body.document.processingJobs as Array<{ jobType: string; status: string }>;
    if (
      jobs.some(
        (j) => j.jobType === "risk_engine" && (j.status === "SUCCEEDED" || j.status === "FAILED"),
      )
    ) {
      return jobs;
    }
    if (Date.now() > deadline) throw new Error("pipeline did not finish");
    await new Promise((r) => setTimeout(r, 300));
  }
}

let token = "";
let documentId = "";

beforeAll(async () => {
  token = await registerUser();
  const upload = await request(app)
    .post("/documents")
    .set("Authorization", `Bearer ${token}`)
    .field("documentType", "agreement_to_sell")
    .attach("file", readFileSync(FIXTURE), "sale.pdf");
  expect(upload.status).toBe(201);
  documentId = upload.body.id;
  const jobs = await waitForPipeline(token, documentId);
  for (const stage of ["domain_detection", "semantic_extraction", "risk_engine"]) {
    expect(jobs.find((j) => j.jobType === stage)?.status, stage).toBe("SUCCEEDED");
  }
}, 90000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

const get = (p: string, t = token) => request(app).get(p).set("Authorization", `Bearer ${t}`);

describe("Phase 8 semantic endpoints (end-to-end)", () => {
  it("overview shows the sale's parties and consideration with evidence", async () => {
    const res = await get(`/documents/${documentId}/overview`);
    expect(res.status).toBe(200);
    expect(res.body.domain).toBe("sale_property");
    const field = (l: string) => res.body.fields.find((f: { label: string }) => f.label === l);
    expect(field("SELLER").values).toEqual(["Manbir Bajaj"]);
    expect(field("BUYER").values).toEqual(["Ayushman Sandal"]);
    expect(field("SALE_CONSIDERATION").normalized).toEqual({ amount: 2370000, currency: "INR" });
    expect(field("SALE_CONSIDERATION").evidence.textStart).toEqual(expect.any(Number));
  });

  it("detection agrees with the declared domain and reports signals, not probabilities", async () => {
    const res = await get(`/documents/${documentId}/detection`);
    expect(res.body.detection.predictedDomain).toBe("sale_property");
    expect(res.body.detection.agreesWithDeclared).toBe(true);
    expect(res.body.detection.supportingSignals.length).toBeGreaterThan(0);
  });

  it("facts and obligations carry normalized values and evidence", async () => {
    const facts = await get(`/documents/${documentId}/facts`);
    const consideration = facts.body.facts.filter(
      (f: { predicate: string }) => f.predicate === "HAS_CONSIDERATION",
    );
    expect(
      consideration
        .map((f: { normalizedValue: { amount: number } }) => f.normalizedValue.amount)
        .sort(),
    ).toEqual([2370000, 3370000]);
    for (const f of facts.body.facts) {
      expect(f.documentId).toBe(documentId);
      expect(f.evidenceText.length).toBeGreaterThan(0);
    }
    const obligations = await get(`/documents/${documentId}/obligations`);
    expect(
      obligations.body.obligations.some(
        (o: { actorLabel: string; action: string }) =>
          o.actorLabel === "BUYER" && o.action === "PAY",
      ),
    ).toBe(true);
  });

  it("consistency flags the contradicting consideration with both spans", async () => {
    const res = await get(`/documents/${documentId}/consistency`);
    const finding = res.body.findings.find(
      (f: { category: string }) => f.category === "FINANCIAL_CONTRADICTION",
    );
    expect(finding.ruleId).toBe("sale_consideration_single");
    expect(finding.reviewRequired).toBe(true);
    expect(finding.evidence.map((e: { text: string }) => e.text.replace(/\s/g, ""))).toEqual([
      "₹23,70,000",
      "₹33,70,000",
    ]);
  });

  it("every semantic endpoint is owner-only", async () => {
    const other = await registerUser();
    for (const p of ["overview", "facts", "obligations", "relations", "detection", "consistency"]) {
      const res = await get(`/documents/${documentId}/${p}`, other);
      expect(res.status, p).toBe(404);
    }
    const unauth = await request(app).get(`/documents/${documentId}/facts`);
    expect(unauth.status).toBe(401);
  });
});

describe("GET /compare (end-to-end)", () => {
  it("a document compared with itself has no differences", async () => {
    const res = await get(`/compare?a=${documentId}&b=${documentId}`);
    expect(res.status).toBe(200);
    expect(res.body.sameDomain).toBe(true);
    expect(res.body.summary.CHANGED + res.body.summary.ADDED + res.body.summary.REMOVED).toBe(0);
    expect(res.body.fields.length).toBeGreaterThan(0);
  });

  it("requires both ids and ownership of both documents", async () => {
    expect((await get(`/compare?a=${documentId}`)).status).toBe(400);
    const other = await registerUser();
    expect((await get(`/compare?a=${documentId}&b=${documentId}`, other)).status).toBe(404);
    expect((await get(`/compare?a=${documentId}&b=${randomUUID()}`)).status).toBe(404);
    expect((await request(app).get(`/compare?a=${documentId}&b=${documentId}`)).status).toBe(401);
  });
});
