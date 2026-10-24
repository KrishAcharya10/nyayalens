import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

// Two benchmark documents through the real upload pipeline and the HTTP API: the findings appear
// with exact evidence, the conflict-aware answer reaches the client with one citation per value,
// and another user can neither read nor ask about the document.
const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const prisma = getPrismaClient();
const emails: string[] = [];
let owner = "";
let stranger = "";
const ids: Record<string, string> = {};

async function register(): Promise<string> {
  const email = `test-anomaly-${randomUUID()}@nyayalens.local`;
  emails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return res.body.accessToken as string;
}
const get = (url: string, token = owner) =>
  request(app).get(url).set("Authorization", `Bearer ${token}`);

async function upload(file: string, documentType: string): Promise<string> {
  const res = await request(app)
    .post("/documents")
    .set("Authorization", `Bearer ${owner}`)
    .field("documentType", documentType)
    .attach("file", readFileSync(path.join(here, "fixtures/anomaly_v2/documents", file)), file);
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  for (let i = 0; i < 120; i++) {
    const d = (await get(`/documents/${id}`)).body.document;
    if (
      d.processingJobs.some(
        (j: { jobType: string; status: string }) =>
          j.jobType === "risk_engine" && ["SUCCEEDED", "FAILED"].includes(j.status),
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return id;
}

beforeAll(async () => {
  owner = await register();
  stranger = await register();
  ids.rental = await upload("B01_residential_rental.docx", "residential_rental");
  ids.service = await upload("B07_service_agreement.docx", "service_agreement");
}, 120000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("benchmark documents through the API", () => {
  it("stores the planted findings with evidence that is in the document text", async () => {
    const detail = (await get(`/documents/${ids.rental}`)).body.document;
    const text: string = detail.canonicalText;
    const risks = (await get(`/documents/${ids.rental}/risks`)).body.risks.filter(
      (r: { modelSource: string }) => r.modelSource === "RULE_BASED",
    );
    const rent = risks.find((r: { category: string }) => r.category === "FINANCIAL_CONTRADICTION");
    expect(rent).toBeTruthy();
    expect(rent.evidence.map((e: { text: string }) => e.text)).toEqual([
      "INR 28,500",
      "INR 31,000",
    ]);
    for (const r of risks)
      for (const e of r.evidence as Array<{ textStart: number; textEnd: number; text: string }>) {
        if (e.text)
          expect(text.slice(e.textStart, e.textEnd).replace(/\s+/g, " ")).toContain(
            e.text.replace(/\s+/g, " ").slice(0, 30),
          );
      }
    expect(
      risks.some((r: { ruleId: string }) => r.ruleId === "missing_term_deposit_refund_deadline"),
    ).toBe(true);
  });

  it("answers a conflicting fact with every value and its own citation", async () => {
    const res = await request(app)
      .post(`/documents/${ids.rental}/ask`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ question: "What is the monthly rent?" });
    expect(res.status).toBe(200);
    expect(res.body.evidenceStatus).toBe("GROUNDED");
    expect(res.body.answer).toContain("28,500");
    expect(res.body.answer).toContain("31,000");
    const excerpts = res.body.sources.map((s: { excerpt: string }) => s.excerpt);
    expect(excerpts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("28,500"),
        expect.stringContaining("31,000"),
      ]),
    );
  });

  it("flags the 30-day against 45-day payment deadline and the uncapped indemnity", async () => {
    const risks = (await get(`/documents/${ids.service}/risks`)).body.risks;
    const cats = risks.map(
      (r: { category: string; ruleId: string }) => `${r.category}/${r.ruleId}`,
    );
    expect(cats).toContain("DURATION_CONTRADICTION/nda_payment_term_single");
    expect(cats.some((c: string) => c.startsWith("UNCAPPED_LIABILITY"))).toBe(true);
  });

  it("refuses a question about something the document does not mention", async () => {
    const res = await request(app)
      .post(`/documents/${ids.rental}/ask`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ question: "What interest is charged on late rent?" });
    expect(res.body.evidenceStatus).toBe("NOT_SUFFICIENT");
    expect(res.body.sources).toEqual([]);
  });

  it("gives another user nothing: 404 for the document, its findings and its questions", async () => {
    for (const suffix of ["", "/risks", "/consistency", "/entities", "/graph"]) {
      expect((await get(`/documents/${ids.rental}${suffix}`, stranger)).status, suffix).toBe(404);
    }
    const ask = await request(app)
      .post(`/documents/${ids.rental}/ask`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ question: "What is the monthly rent?" });
    expect(ask.status).toBe(404);
  });
});
