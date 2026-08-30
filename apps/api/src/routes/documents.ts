import { Router } from "express";
import { getPrismaClient } from "@nyayalens/db";
import { requireAuth } from "../middleware/auth.js";

const prisma = getPrismaClient();
export const documentsRouter = Router();

// Lists document metadata owned by the authenticated user only. Document
// upload/processing is a later phase - this only proves the "users can
// only access their own documents" RBAC rule against existing rows.
documentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { ownerId: req.auth!.userId },
      select: { id: true, title: true, documentType: true, isSynthetic: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ documents });
  } catch (err) {
    next(err);
  }
});
