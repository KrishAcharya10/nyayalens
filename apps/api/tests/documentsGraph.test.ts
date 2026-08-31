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
  const email = `test-graph-${randomUUID()}@nyayalens.local`;
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

describe("GET /documents/:id/graph (Phase 7A)", () => {
  it("returns a graph whose nodes/edges match the document's persisted entities/clauses/risks exactly", async () => {
    const user = await registerUser();
    const documentId = await uploadAndProcess(user.accessToken);

    const [entitiesRes, clausesRes, risksRes, graphRes] = await Promise.all([
      request(app)
        .get(`/documents/${documentId}/entities`)
        .set("Authorization", `Bearer ${user.accessToken}`),
      request(app)
        .get(`/documents/${documentId}/clauses`)
        .set("Authorization", `Bearer ${user.accessToken}`),
      request(app)
        .get(`/documents/${documentId}/risks`)
        .set("Authorization", `Bearer ${user.accessToken}`),
      request(app)
        .get(`/documents/${documentId}/graph`)
        .set("Authorization", `Bearer ${user.accessToken}`),
    ]);

    expect(graphRes.status).toBe(200);
    const graph = graphRes.body.graph;

    const ruleBasedEntities = (entitiesRes.body.entities as { id: string }[]).filter(
      (e: { id: string } & Record<string, unknown>) =>
        (e as { modelSource?: string }).modelSource === "RULE_BASED",
    );
    const ruleBasedClauses = (clausesRes.body.clauses as { id: string }[]).filter(
      (c: { id: string } & Record<string, unknown>) =>
        (c as { modelSource?: string }).modelSource === "RULE_BASED",
    );
    const ruleBasedRisks = (risksRes.body.risks as { id: string }[]).filter(
      (r: { id: string } & Record<string, unknown>) =>
        (r as { modelSource?: string }).modelSource === "RULE_BASED",
    );

    const entityNodeIds = graph.nodes
      .filter((n: { type: string }) => n.type === "ENTITY")
      .map((n: { id: string }) => n.id);
    const clauseNodeIds = graph.nodes
      .filter((n: { type: string }) => n.type === "CLAUSE")
      .map((n: { id: string }) => n.id);
    const riskNodeIds = graph.nodes
      .filter((n: { type: string }) => n.type === "RISK_FINDING")
      .map((n: { id: string }) => n.id);

    expect(entityNodeIds.sort()).toEqual(ruleBasedEntities.map((e) => `entity:${e.id}`).sort());
    expect(clauseNodeIds.sort()).toEqual(ruleBasedClauses.map((c) => `clause:${c.id}`).sort());
    expect(riskNodeIds.sort()).toEqual(ruleBasedRisks.map((r) => `risk:${r.id}`).sort());

    const hasClauseEdges = graph.edges.filter((e: { type: string }) => e.type === "HAS_CLAUSE");
    expect(hasClauseEdges).toHaveLength(ruleBasedClauses.length);
    const hasEntityEdges = graph.edges.filter((e: { type: string }) => e.type === "HAS_ENTITY");
    expect(hasEntityEdges).toHaveLength(ruleBasedEntities.length);
  });

  it("does not let a user read another user's graph", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const documentId = await uploadAndProcess(owner.accessToken);

    const res = await request(app)
      .get(`/documents/${documentId}/graph`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/00000000-0000-0000-0000-000000000000/graph");
    expect(res.status).toBe(401);
  });
});
