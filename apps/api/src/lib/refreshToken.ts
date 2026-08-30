import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPrismaClient } from "@nyayalens/db";
import { env } from "../config/env.js";

const prisma = getPrismaClient();

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function newExpiry(): Date {
  const days = env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export interface IssuedRefreshToken {
  rawToken: string;
  familyId: string;
  expiresAt: Date;
}

// Issues a brand-new refresh token family (used at login/register).
export async function issueRefreshToken(
  userId: string,
  createdByIp?: string,
): Promise<IssuedRefreshToken> {
  const rawToken = randomBytes(48).toString("hex");
  const familyId = randomUUID();
  const expiresAt = newExpiry();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      familyId,
      expiresAt,
      createdByIp: createdByIp ?? null,
    },
  });

  return { rawToken, familyId, expiresAt };
}

export class RefreshTokenError extends Error {}

// Rotates a refresh token: validates the presented token, marks it revoked,
// and issues a replacement in the same family. If a token that was already
// revoked/rotated is presented again (token reuse - a signal of theft), the
// entire family is revoked so all descendant tokens stop working.
export async function rotateRefreshToken(
  rawToken: string,
  createdByIp?: string,
): Promise<{ userId: string; role: "USER" | "ADMIN"; issued: IssuedRefreshToken }> {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw new RefreshTokenError("Refresh token not recognized");
  }

  if (existing.revokedAt) {
    // Reuse of a rotated/revoked token: kill the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new RefreshTokenError("Refresh token reuse detected - session family revoked");
  }

  if (existing.expiresAt < new Date()) {
    throw new RefreshTokenError("Refresh token expired");
  }

  const issued = await issueRefreshTokenInFamily(existing.userId, existing.familyId, createdByIp);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedByTokenHash: hashToken(issued.rawToken) },
  });

  return { userId: existing.userId, role: existing.user.role, issued };
}

async function issueRefreshTokenInFamily(
  userId: string,
  familyId: string,
  createdByIp?: string,
): Promise<IssuedRefreshToken> {
  const rawToken = randomBytes(48).toString("hex");
  const expiresAt = newExpiry();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      familyId,
      expiresAt,
      createdByIp: createdByIp ?? null,
    },
  });

  return { rawToken, familyId, expiresAt };
}

// Revokes a single presented refresh token (logout).
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Revokes every active refresh token for a user (admin action / "log out everywhere").
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
