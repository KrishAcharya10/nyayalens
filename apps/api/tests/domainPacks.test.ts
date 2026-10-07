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

async function registerUser(): Promise<{ email: string; accessToken: string }> {
  const email = `test-packs-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email, accessToken: res.body.accessToken as string };
}

describe("GET /domain-packs (Phase 8)", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/domain-packs");
    expect(res.status).toBe(401);
  });

  it("lists every registered pack with its upload slugs and ontology, without regexes", async () => {
    const user = await registerUser();
    const res = await request(app)
      .get("/domain-packs")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    const packs = res.body.domainPacks as Array<{
      id: string;
      documentTypes: Array<{ id: string; slug: string }>;
      entityTypes: Array<{ label: string; coreType: string }>;
      clauseTypes: string[];
    }>;
    const ids = packs.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["residential_rental", "land_lease"]));

    const rental = packs.find((p) => p.id === "residential_rental")!;
    expect(rental.documentTypes).toEqual([
      expect.objectContaining({ id: "RESIDENTIAL_RENTAL", slug: "residential_rental" }),
    ]);
    expect(rental.entityTypes).toEqual(
      expect.arrayContaining([{ label: "TENANT", displayName: "Tenant", coreType: "PARTY" }]),
    );
    expect(rental.clauseTypes).toContain("SECURITY_DEPOSIT");
    // Implementation details stay server-side.
    expect(JSON.stringify(res.body)).not.toContain("headingPattern");
    expect(JSON.stringify(res.body)).not.toContain("perClauseChecks");
  });
});

describe("POST /documents documentType validation (Phase 8)", () => {
  it("rejects an unregistered documentType with 400 and stores nothing", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "spaceship_charter")
      .attach("file", readFileSync(PDF_FIXTURE), "sample.pdf");

    expect(upload.status).toBe(400);
    expect(upload.body.error).toContain("residential_rental");
    const owned = await prisma.document.count({ where: { owner: { email: user.email } } });
    expect(owned).toBe(0);
  });

  it("does not accept the DB enum spelling in place of the upload slug", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "LAND_LEASE")
      .attach("file", readFileSync(PDF_FIXTURE), "sample.pdf");

    expect(upload.status).toBe(400);
  });
});
