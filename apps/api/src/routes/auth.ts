import { Router } from "express";
import { getPrismaClient } from "@nyayalens/db";
import { z } from "zod";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  RefreshTokenError,
} from "../lib/refreshToken.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

const prisma = getPrismaClient();
export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = registerSchema;

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresInMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
  };
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: "USER" },
    });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refresh = await issueRefreshToken(user.id, req.ip);

    res.status(201).json(tokenResponse(accessToken, refresh.rawToken));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refresh = await issueRefreshToken(user.id, req.ip);

    res.status(200).json(tokenResponse(accessToken, refresh.rawToken));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { userId, role, issued } = await rotateRefreshToken(parsed.data.refreshToken, req.ip);
    const accessToken = signAccessToken({ sub: userId, role });

    res.status(200).json(tokenResponse(accessToken, issued.rawToken));
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await revokeRefreshToken(parsed.data.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(200).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});
