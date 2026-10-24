import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

// Found by running the app and auditing it: a wildcard CORS policy, no limit
// on failed sign-ins, and an oversize upload answered with a 500.
const app = createApp();
const prisma = getPrismaClient();
const createdEmails: string[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

async function registerUser(): Promise<{ email: string; token: string }> {
  const email = `test-security-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email, token: res.body.accessToken as string };
}

describe("CORS", () => {
  it("allows the configured web origin", async () => {
    const origin = env.CORS_ORIGINS.split(",")[0]!.trim();
    const res = await request(app).get("/health").set("Origin", origin);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("does not allow an arbitrary origin", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not answer a pre-flight from an arbitrary origin with an allow header", async () => {
    const res = await request(app)
      .options("/documents")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("login throttling", () => {
  it("answers 429 after too many failed sign-ins for one account, and no other account is affected", async () => {
    const victim = await registerUser();
    const bystander = await registerUser();

    for (let i = 0; i < env.AUTH_LOGIN_MAX_FAILURES; i++) {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: victim.email, password: `wrong-password-${i}` });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post("/auth/login")
      .send({ email: victim.email, password: "wrong-password-again" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);

    const other = await request(app)
      .post("/auth/login")
      .send({ email: bystander.email, password: "correct-horse-battery-staple" });
    expect(other.status).toBe(200);
  }, 60000);

  it("does not count successful sign-ins", async () => {
    const user = await registerUser();
    for (let i = 0; i < env.AUTH_LOGIN_MAX_FAILURES + 2; i++) {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: user.email, password: "correct-horse-battery-staple" });
      expect(res.status).toBe(200);
    }
  }, 60000);
});

describe("request errors are client errors, not 500s", () => {
  it("rejects an upload over the size limit with 413", async () => {
    const { token } = await registerUser();
    const tooBig = Buffer.alloc(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1024, 0x25);
    const res = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("documentType", "residential_rental")
      .attach("file", tooBig, "huge.pdf");
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  }, 60000);

  it("rejects an empty file and a file with no content type we accept with 400", async () => {
    const { token } = await registerUser();
    const empty = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("documentType", "residential_rental")
      .attach("file", Buffer.alloc(0), "empty.pdf");
    expect(empty.status).toBe(400);
    const text = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("documentType", "residential_rental")
      .attach("file", Buffer.from("plain text, not a document"), "notes.txt");
    expect(text.status).toBe(400);
  });

  it("accepts a truncated PDF at upload but records the processing failure instead of hanging", async () => {
    const { token } = await registerUser();
    const truncated = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% cut off");
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("documentType", "residential_rental")
      .attach("file", truncated, "truncated.pdf");
    expect(upload.status).toBe(201);
    let status = "";
    for (let i = 0; i < 40 && status !== "FAILED"; i++) {
      const res = await request(app)
        .get("/documents/summary")
        .set("Authorization", `Bearer ${token}`);
      status = res.body.documents.find((d: { id: string }) => d.id === upload.body.id)
        .processingStatus as string;
      if (status !== "FAILED") await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe("FAILED");
  }, 30000);

  it("answers malformed JSON with 400, not 500", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@b.c", "password": ');
    expect(res.status).toBe(400);
  });
});
