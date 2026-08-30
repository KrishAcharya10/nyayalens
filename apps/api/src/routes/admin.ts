import { Router } from "express";
import { getPrismaClient } from "@nyayalens/db";
import { requireAuth, requireRole } from "../middleware/auth.js";

const prisma = getPrismaClient();
export const adminRouter = Router();

// Minimal admin-only analytics endpoint, used to verify RBAC enforcement.
// Document-level analytics beyond row counts are a later-phase concern.
adminRouter.get("/stats", requireAuth, requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const [userCount, documentCount] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
    ]);
    res.status(200).json({ userCount, documentCount });
  } catch (err) {
    next(err);
  }
});
