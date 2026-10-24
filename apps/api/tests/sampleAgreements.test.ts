import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

// End-to-end over four hand-written-style synthetic agreements
// (tests/fixtures/samples): upload -> pipeline -> every analysis endpoint ->
// graph -> Q&A -> cross-user access. They are not generator output (curly
// quotes, "INR 8,000,000", "Gat No.", "1 November 2026"), so they exercise
// the rules on wording the benchmark never produced.
//
// The ANSWER KEY below is what a reader finds in each document. It is used
// only to check results; nothing here is fed to the system, which sees the
// .docx alone.
//
// Caveat recorded in docs/evaluation.md: these four documents were used to
// find and fix generalisation defects (party definitions in brackets, date
// formats, short headings, risk phrasings). They therefore demonstrate the
// fixes; they are no longer independent held-out evidence.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const prisma = getPrismaClient();
const createdEmails: string[] = [];

interface Key {
  file: string;
  documentType: string; // upload slug
  domain: string;
  entities: Array<[label: string, text: string]>;
  clauseTypes: string[];
  /** The planted problem: category expected, and a phrase from the clause that must be its evidence. */
  planted: { category: string; evidencePhrase: string } | null;
  /** Categories that would be a false positive on this document. */
  mustNotFlag: string[];
  answerable: { question: string; contains: string };
  unanswerable: string;
}

const KEYS: Key[] = [
  {
    file: "01_synthetic_residential_rental.docx",
    documentType: "residential_rental",
    domain: "residential_rental",
    entities: [
      ["LANDLORD", "Ananya Mehta"],
      ["TENANT", "Rohan Shah"],
      ["RENT", "INR 32,000"],
      ["SECURITY_DEPOSIT", "INR 96,000"],
      ["DURATION", "12 months"],
      ["NOTICE_PERIOD", "60 days"],
      ["EXECUTION_DATE", "1 November 2026"],
      ["EXPIRY_DATE", "31 October 2027"],
    ],
    clauseTypes: [
      "LEASE_DURATION",
      "RENT_PAYMENT",
      "SECURITY_DEPOSIT",
      "MAINTENANCE",
      "TERMINATION",
      "UTILITIES",
      "DISPUTE_RESOLUTION",
    ],
    // Clause 8: either party 60 days' notice, but the Landlord may require the
    // Tenant to vacate immediately, without notice, whenever it "considers the
    // Tenant's conduct undesirable".
    planted: { category: "ASYMMETRIC_OBLIGATION", evidencePhrase: "vacate immediately" },
    // Clause 6 puts structural repairs on the Landlord, excepting damage the
    // Tenant causes - that is not a liability shift.
    mustNotFlag: ["LIABILITY_SHIFT"],
    answerable: { question: "What is the rent?", contains: "32,000" },
    unanswerable: "What is the probation period?",
  },
  {
    file: "02_synthetic_leave_and_license.docx",
    documentType: "leave_and_license",
    domain: "leave_and_license",
    entities: [
      ["LICENSOR", "Dev Kulkarni"],
      ["LICENSEE", "Isha Nair"],
      ["LICENSE_FEE", "INR 28,000"],
      ["SECURITY_DEPOSIT", "INR 84,000"],
      ["COMMENCEMENT_DATE", "1 December 2026"],
      ["EXPIRY_DATE", "30 November 2027"],
      ["NOTICE_PERIOD", "30 days"],
    ],
    clauseTypes: [
      "LICENSE_PERIOD",
      "LICENSE_FEE",
      "SECURITY_DEPOSIT",
      "MAINTENANCE",
      "TERMINATION",
      "POSSESSION",
      "DISPUTE_RESOLUTION",
    ],
    // Clause 8: the Licensor may retain the entire deposit if the Licensee gives
    // any notice, even where all fees are paid and nothing is damaged.
    planted: { category: "ONE_SIDED_REMEDY", evidencePhrase: "retain the entire security deposit" },
    // The Licensor bears structural repairs, excepting damage the Licensee causes.
    mustNotFlag: ["LIABILITY_SHIFT"],
    answerable: { question: "What is the licence fee?", contains: "28,000" },
    unanswerable: "What is the annual CTC?",
  },
  {
    file: "03_synthetic_land_lease.docx",
    documentType: "land_lease",
    domain: "land_lease",
    entities: [
      ["LESSOR", "Suresh Patil"],
      ["LESSEE", "Meera Jadhav"],
      ["SURVEY_NUMBER", "118/2"],
      ["LAND_AREA", "2.40 hectares"],
      ["RENT", "INR 1,20,000"],
      ["COMMENCEMENT_DATE", "1 November 2026"],
      ["EXPIRY_DATE", "31 October 2029"],
    ],
    clauseTypes: [
      "LAND_USE_RESTRICTION",
      "LEASE_DURATION",
      "RENT_PAYMENT",
      "WATER_RIGHTS",
      "TERMINATION",
      "DISPUTE_RESOLUTION",
    ],
    // Clause 8: the Owner may terminate immediately "if the Owner believes the
    // Cultivator has used the Land improperly", without reasons or a chance to respond.
    planted: { category: "UNBOUNDED_DISCRETION", evidencePhrase: "believes the Cultivator" },
    mustNotFlag: ["LIABILITY_SHIFT", "LAND_USE_CONTRADICTION"],
    answerable: { question: "What is the rent?", contains: "1,20,000" },
    unanswerable: "What is the notice period?",
  },
  {
    file: "04_synthetic_sale_of_property.docx",
    documentType: "agreement_to_sell",
    domain: "sale_property",
    entities: [
      ["SELLER", "Arjun Desai"],
      ["BUYER", "Kavya Rao"],
      ["SALE_CONSIDERATION", "INR 8,000,000"],
      ["ADVANCE_AMOUNT", "INR 1,000,000"],
      ["POSSESSION_DATE", "31 March 2027"],
      ["CTS_NUMBER", "884A"],
    ],
    clauseTypes: [
      "PROPERTY_DESCRIPTION",
      "CONSIDERATION",
      "PAYMENT_SCHEDULE",
      "POSSESSION",
      "ENCUMBRANCE",
      "TAXES",
      "DEFAULT",
      "REGISTRATION",
      "DISPUTE_RESOLUTION",
    ],
    // No contradiction is planted here: the consideration is stated once, in
    // figures and words that agree. (INR 8,000,000 = Rupees Eighty Lakh.)
    planted: null,
    mustNotFlag: [
      "FINANCIAL_CONTRADICTION",
      "PAYMENT_TOTAL_MISMATCH",
      "PROPERTY_AREA_CONTRADICTION",
    ],
    answerable: { question: "Who is the buyer?", contains: "Kavya Rao" },
    unanswerable: "What is the probation period?",
  },
];

interface Loaded {
  id: string;
  text: string;
  entities: Array<{ id: string; label: string; text: string; textStart: number; textEnd: number }>;
  clauses: Array<{ id: string; clauseType: string; textStart: number; textEnd: number }>;
  risks: Array<{
    category: string;
    pass: string;
    evidence: Array<{ sourceTable: string; sourceId: string; textStart: number; textEnd: number }>;
  }>;
  jobs: Array<{ jobType: string; status: string }>;
}

let owner = "";
let stranger = "";
const loaded = new Map<string, Loaded>();
const get = (url: string, token = owner) =>
  request(app).get(url).set("Authorization", `Bearer ${token}`);

async function register(): Promise<string> {
  const email = `test-samples-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  owner = await register();
  stranger = await register();
  for (const key of KEYS) {
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${owner}`)
      .field("documentType", key.documentType)
      .attach(
        "file",
        readFileSync(path.resolve(__dirname, "fixtures/samples", key.file)),
        key.file,
      );
    expect(upload.status, key.file).toBe(201);
    const id = upload.body.id as string;
    let detail = (await get(`/documents/${id}`)).body.document;
    for (let i = 0; i < 120; i++) {
      detail = (await get(`/documents/${id}`)).body.document;
      if (
        detail.processingJobs.some(
          (j: { jobType: string; status: string }) =>
            j.jobType === "risk_engine" && ["SUCCEEDED", "FAILED"].includes(j.status),
        )
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const rule = <T extends { modelSource?: string }>(rows: T[]) =>
      rows.filter((r) => r.modelSource === "RULE_BASED");
    loaded.set(key.file, {
      id,
      text: detail.canonicalText ?? "",
      jobs: detail.processingJobs,
      entities: rule((await get(`/documents/${id}/entities`)).body.entities),
      clauses: rule((await get(`/documents/${id}/clauses`)).body.clauses),
      risks: rule((await get(`/documents/${id}/risks`)).body.risks),
    });
  }
}, 180000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe.each(KEYS)("$file", (key) => {
  const d = () => loaded.get(key.file)!;

  it("processes through every rule-based stage and is detected as the declared domain", async () => {
    for (const stage of [
      "text_extraction",
      "ocr",
      "domain_detection",
      "rule_based_ner",
      "clause_classification",
      "semantic_extraction",
      "risk_engine",
    ]) {
      expect(d().jobs.find((j) => j.jobType === stage)?.status, stage).toBe("SUCCEEDED");
    }
    const detection = (await get(`/documents/${d().id}/detection`)).body.detection;
    expect(detection.predictedDomain).toBe(key.domain);
    expect(detection.agreesWithDeclared).toBe(true);
    expect(d().text.length).toBeGreaterThan(2000);
  });

  it("extracts the entities a reader finds, with exact source text", () => {
    for (const [label, text] of key.entities) {
      expect(
        d().entities.some((e) => e.label === label && e.text === text),
        `${label} = ${text}`,
      ).toBe(true);
    }
  });

  it("recognises the clause headings", () => {
    const types = new Set(d().clauses.map((c) => c.clauseType));
    for (const t of key.clauseTypes) expect(types.has(t), t).toBe(true);
  });

  it("keeps every span valid: entities equal their source text, clauses are ordered and disjoint, evidence is in range", () => {
    const { text } = d();
    for (const e of d().entities) {
      expect(e.textStart).toBeGreaterThanOrEqual(0);
      expect(e.textEnd).toBeLessThanOrEqual(text.length);
      expect(e.textStart).toBeLessThan(e.textEnd);
      expect(text.slice(e.textStart, e.textEnd), `${e.label}`).toBe(e.text);
    }
    const clauses = [...d().clauses].sort((a, b) => a.textStart - b.textStart);
    for (let i = 0; i < clauses.length; i++) {
      expect(clauses[i]!.textStart).toBeLessThan(clauses[i]!.textEnd);
      expect(clauses[i]!.textEnd).toBeLessThanOrEqual(text.length);
      if (i > 0) expect(clauses[i]!.textStart).toBeGreaterThanOrEqual(clauses[i - 1]!.textEnd);
    }
    for (const r of d().risks) {
      for (const ev of r.evidence) {
        expect(ev.textStart).toBeGreaterThanOrEqual(0);
        expect(ev.textEnd).toBeLessThanOrEqual(text.length);
        expect(ev.textStart).toBeLessThan(ev.textEnd);
      }
    }
  });

  if (key.planted) {
    it(`flags the planted problem (${key.planted.category}) and cites the right clause`, () => {
      const planted = key.planted!;
      const hit = d().risks.find(
        (r) =>
          r.category === planted.category &&
          r.evidence.some((ev) =>
            d()
              .text.slice(ev.textStart, ev.textEnd)
              .replace(/\s+/g, " ")
              .includes(planted.evidencePhrase),
          ),
      );
      expect(hit, `${planted.category} citing "${planted.evidencePhrase}"`).toBeDefined();
    });
  }

  it("does not raise findings that would be false positives here", () => {
    const categories = d().risks.map((r) => r.category);
    for (const c of key.mustNotFlag) expect(categories, c).not.toContain(c);
  });

  it("builds a consistent graph: unique ids, every edge connects existing nodes, one node per entity", async () => {
    const graph = (await get(`/documents/${d().id}/graph`)).body.graph;
    const ids = graph.nodes.map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set<string>(ids);
    for (const e of graph.edges as Array<{ from: string; to: string; type: string }>) {
      expect(known.has(e.from), `${e.type} from ${e.from}`).toBe(true);
      expect(known.has(e.to), `${e.type} to ${e.to}`).toBe(true);
      expect(e.type).not.toBe("APPLIES_TO");
    }
    const entityNodes = graph.nodes.filter((n: { type: string }) => n.type === "ENTITY");
    expect(entityNodes.length).toBe(d().entities.length);
  });

  it("answers an answerable question from the document, citing a valid span", async () => {
    const res = await request(app)
      .post(`/documents/${d().id}/ask`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ question: key.answerable.question });
    expect(res.status).toBe(200);
    expect(res.body.evidenceStatus).toBe("GROUNDED");
    expect(res.body.answer).toContain(key.answerable.contains);
    expect(res.body.sources.length).toBeGreaterThan(0);
    for (const s of res.body.sources as Array<{
      textStart: number;
      textEnd: number;
      excerpt: string;
    }>) {
      expect(s.textStart).toBeGreaterThanOrEqual(0);
      expect(s.textEnd).toBeLessThanOrEqual(d().text.length);
      expect(d().text.replace(/\s+/g, " ")).toContain(s.excerpt.replace(/\s+/g, " ").slice(0, 40));
    }
  });

  it("refuses an unanswerable question instead of inventing an answer", async () => {
    const res = await request(app)
      .post(`/documents/${d().id}/ask`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ question: key.unanswerable });
    expect(res.status).toBe(200);
    expect(res.body.evidenceStatus).toBe("NOT_SUFFICIENT");
    expect(res.body.sources).toEqual([]);
  });

  it("denies every route to another user (404, never revealing the document exists)", async () => {
    const id = d().id;
    for (const p of [
      "",
      "/entities",
      "/clauses",
      "/risks",
      "/graph",
      "/facts",
      "/obligations",
      "/relations",
      "/overview",
      "/detection",
      "/consistency",
    ]) {
      expect((await get(`/documents/${id}${p}`, stranger)).status, p || "(document)").toBe(404);
    }
    const ask = await request(app)
      .post(`/documents/${id}/ask`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ question: "Who is the buyer?" });
    expect(ask.status).toBe(404);
    expect((await get(`/compare?a=${id}&b=${id}`, stranger)).status).toBe(404);
    const del = await request(app)
      .delete(`/documents/${id}`)
      .set("Authorization", `Bearer ${stranger}`);
    expect(del.status).toBe(404);
  });
});
