// GET /compare?a=<documentId>&b=<documentId> - Phase 8 document comparison.
// Both documents must belong to the caller; if either does not, the answer
// is 404 for the pair (never revealing which one exists).
import { Router } from "express";
import { getPrismaClient } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import { requireAuth } from "../middleware/auth.js";
import { compareDocuments, type CompareSide } from "../semantic/compare.js";
import { loadDocumentSemantics } from "../semantic/loadSemantics.js";

const prisma = getPrismaClient();
export const compareRouter = Router();

async function loadSide(documentId: string): Promise<CompareSide> {
  const [s, clauseRows, riskRows] = await Promise.all([
    loadDocumentSemantics(documentId),
    prisma.documentClause.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: {
        id: true,
        clauseType: true,
        clauseNumber: true,
        text: true,
        textStart: true,
        textEnd: true,
      },
    }),
    prisma.risk.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, category: true, severity: true, reason: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    documentId,
    documentType: s.documentType,
    pack: getDomainPackRegistry().forDocumentType(s.documentType),
    entities: s.entities,
    clauses: clauseRows
      .filter((c) => c.textStart !== null && c.textEnd !== null)
      .map((c) => ({ ...c, text: c.text ?? "", textStart: c.textStart!, textEnd: c.textEnd! })),
    obligations: s.obligations.map((o) => ({
      actorLabel: o.actorLabel,
      action: o.action,
      amountInr: o.amountInr,
      deadlineText: o.deadlineText,
      evidenceText: o.evidenceText,
      textStart: o.textStart,
      textEnd: o.textEnd,
    })),
    risks: riskRows.map((r) => ({ ...r, severity: String(r.severity) })),
    relations: s.relations.flatMap((r) => {
      const object = s.entities.find((e) => e.id === r.objectEntityId);
      return object
        ? [
            {
              relationType: r.relationType,
              subjectLabel: r.subjectLabel,
              objectLabel: r.objectLabel,
              objectText: object.text,
            },
          ]
        : [];
    }),
  };
}

compareRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { a, b } = req.query;
    if (typeof a !== "string" || typeof b !== "string" || !a || !b) {
      res.status(400).json({ error: "Query parameters a and b (document ids) are required" });
      return;
    }
    const owned = await prisma.document.findMany({
      where: { id: { in: [a, b] }, ownerId: req.auth!.userId },
      select: { id: true },
    });
    if (new Set(owned.map((d) => d.id)).size !== new Set([a, b]).size) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const [sideA, sideB] = await Promise.all([loadSide(a), loadSide(b)]);
    res.status(200).json(compareDocuments(sideA, sideB));
  } catch (err) {
    next(err);
  }
});
