import type { NextFunction, Request, Response } from "express";
import { InvalidAccessTokenError, verifyAccessToken } from "../lib/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: "USER" | "ADMIN" };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const claims = verifyAccessToken(token);
    req.auth = { userId: claims.sub, role: claims.role };
    next();
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) {
      res.status(401).json({ error: "Invalid or expired access token" });
      return;
    }
    next(err);
  }
}

export function requireRole(role: "USER" | "ADMIN") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    if (req.auth.role !== role) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}
