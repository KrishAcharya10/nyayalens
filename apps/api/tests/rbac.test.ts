import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const prisma = getPrismaClient();

function uniqueEmail(): string {
  return `test-rbac-${randomUUID()}@nyayalens.local`;
}

const createdEmails: string[] = [];

afterAll(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await prisma.$disconnect();
});

async function registerUser(): Promise<{ email: string; accessToken: string }> {
  const email = uniqueEmail();
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email, accessToken: res.body.accessToken as string };
}

async function registerAdmin(): Promise<{ email: string; accessToken: string }> {
  const { email } = await registerUser();
  const user = await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  // Re-login so the returned access token carries the ADMIN role claim.
  const login = await request(app)
    .post("/auth/login")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email: user.email, accessToken: login.body.accessToken as string };
}

describe("RBAC", () => {
  it("denies a USER access to an ADMIN-only route", async () => {
    const user = await registerUser();

    const res = await request(app)
      .get("/admin/stats")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("denies an unauthenticated caller access to an ADMIN-only route", async () => {
    const res = await request(app).get("/admin/stats");
    expect(res.status).toBe(401);
  });

  it("allows an ADMIN to access the ADMIN-only route", async () => {
    const admin = await registerAdmin();

    const res = await request(app)
      .get("/admin/stats")
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.userCount).toBeTypeOf("number");
  });

  it("only returns documents owned by the requesting user", async () => {
    const userA = await registerUser();
    const userB = await registerUser();

    const userARecord = await prisma.user.findUniqueOrThrow({ where: { email: userA.email } });
    const doc = await prisma.document.create({
      data: {
        ownerId: userARecord.id,
        title: "rbac-test-doc",
        documentType: "RESIDENTIAL_RENTAL",
        isSynthetic: true,
      },
    });

    const asOwner = await request(app)
      .get("/documents")
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(asOwner.body.documents.some((d: { id: string }) => d.id === doc.id)).toBe(true);

    const asOther = await request(app)
      .get("/documents")
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(asOther.body.documents.some((d: { id: string }) => d.id === doc.id)).toBe(false);

    await prisma.document.delete({ where: { id: doc.id } });
  });
});
