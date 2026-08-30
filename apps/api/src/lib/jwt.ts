import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenClaims {
  sub: string;
  role: "USER" | "ADMIN";
}

const ALGORITHM = "HS256" as const;

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export class InvalidAccessTokenError extends Error {}

// Explicitly pins the algorithm, issuer, audience, and expiration check on
// every verification - never trust a decoded-but-unverified token.
export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    if (typeof decoded === "string") {
      throw new InvalidAccessTokenError("Unexpected token payload");
    }
    const { sub, role } = decoded;
    if (typeof sub !== "string" || (role !== "USER" && role !== "ADMIN")) {
      throw new InvalidAccessTokenError("Malformed token claims");
    }
    return { sub, role };
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) throw err;
    throw new InvalidAccessTokenError(err instanceof Error ? err.message : "Invalid token");
  }
}
