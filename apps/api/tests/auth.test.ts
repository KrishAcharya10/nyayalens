import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const prisma = getPrismaClient();

function uniqueEmail(): string {
  return `test-${randomUUID()}@nyayalens.local`;
}

const createdEmails: string[] = [];

afterAll(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await prisma.$disconnect();
});

describe("auth flow", () => {
  it("registers a new user and returns tokens", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const res = await request(app)
      .post("/auth/register")
      .send({ email, password: "correct-horse-battery-staple" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.refreshToken).toBeTypeOf("string");
  });

  it("rejects duplicate registration for the same email", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await request(app)
      .post("/auth/register")
      .send({ email, password: "correct-horse-battery-staple" });

    const res = await request(app)
      .post("/auth/register")
      .send({ email, password: "another-password-123" });

    expect(res.status).toBe(409);
  });

  it("never stores the plaintext password", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const password = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email, password });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("logs in with correct credentials and rejects incorrect ones", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const password = "correct-horse-battery-staple";
    await request(app).post("/auth/register").send({ email, password });

    const good = await request(app).post("/auth/login").send({ email, password });
    expect(good.status).toBe(200);
    expect(good.body.accessToken).toBeTypeOf("string");

    const bad = await request(app).post("/auth/login").send({ email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("issues a working access token that authenticates /auth/me", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const password = "correct-horse-battery-staple";
    const register = await request(app).post("/auth/register").send({ email, password });

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${register.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it("rejects requests with no token and with a garbage token", async () => {
    const noToken = await request(app).get("/auth/me");
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });

  it("rotates the refresh token on use and invalidates the old one", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const register = await request(app)
      .post("/auth/register")
      .send({ email, password: "correct-horse-battery-staple" });

    const firstRefreshToken = register.body.refreshToken as string;

    const rotated = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(rotated.status).toBe(200);
    const secondRefreshToken = rotated.body.refreshToken as string;
    expect(secondRefreshToken).not.toBe(firstRefreshToken);

    // Reusing the now-rotated-out token must fail.
    const reuseAttempt = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(reuseAttempt.status).toBe(401);

    // Reuse detection revokes the whole family, so even the latest token
    // issued from it is now dead.
    const secondAttempt = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: secondRefreshToken });
    expect(secondAttempt.status).toBe(401);
  });

  it("logout revokes the refresh token so it cannot be reused", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const register = await request(app)
      .post("/auth/register")
      .send({ email, password: "correct-horse-battery-staple" });

    const refreshToken = register.body.refreshToken as string;

    const logout = await request(app).post("/auth/logout").send({ refreshToken });
    expect(logout.status).toBe(204);

    const reuseAfterLogout = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(reuseAfterLogout.status).toBe(401);
  });
});
