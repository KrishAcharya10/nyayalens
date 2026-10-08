// Phase 8 read endpoints over a document's semantic layer. Every route
// checks ownership in the same query that loads the document, like the
// rest of /documents.
import { Router } from "express";
import { getPrismaClient } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import { requireAuth } from "../middleware/auth.js";
import { loadDocumentSemantics } from "../semantic/loadSemantics.js";
import { normalizeByCoreType } from "../semantic/normalize.js";

const prisma = getPrismaClient();
export const semanticsRouter = Router();

async function ownedDocument(id: unknown, userId: string) {
  if (typeof id !== "string") return null;
  return prisma.document.findFirst({
    where: { id, ownerId: userId },
    select: { id: true, documentType: true, domainDetection: true },
  });
}

semanticsRouter.get("/:id/facts", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const s = await loadDocumentSemantics(doc.id);
    res.status(200).json({
      domain: s.domain,
      facts: s.semantic.facts,
      temporalFacts: s.semantic.temporal,
      financialFacts: s.semantic.financial,
    });
  } catch (err) {
    next(err);
  }
});

semanticsRouter.get("/:id/obligations", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const s = await loadDocumentSemantics(doc.id);
    res.status(200).json({ obligations: s.obligations });
  } catch (err) {
    next(err);
  }
});

semanticsRouter.get("/:id/relations", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const s = await loadDocumentSemantics(doc.id);
    res.status(200).json({ relations: s.relations });
  } catch (err) {
    next(err);
  }
});

semanticsRouter.get("/:id/detection", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.status(200).json({ detection: doc.domainDetection ?? null });
  } catch (err) {
    next(err);
  }
});

semanticsRouter.get("/:id/consistency", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const findings = await prisma.risk.findMany({
      where: { documentId: doc.id, pass: "CONSISTENCY" },
      orderBy: { createdAt: "asc" },
    });
    res.status(200).json({ findings });
  } catch (err) {
    next(err);
  }
});

// The domain-specific Overview card: the pack's overviewFields, each with its
// first value, normalized value and evidence span (or null when absent -
// "not found in the document", never a guess).
semanticsRouter.get("/:id/overview", requireAuth, async (req, res, next) => {
  try {
    const doc = await ownedDocument(req.params.id, req.auth!.userId);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const pack = getDomainPackRegistry().forDocumentType(doc.documentType);
    const s = await loadDocumentSemantics(doc.id);
    const display = new Map(pack.entitySchema.map((e) => [e.label, e]));
    const fields = pack.overviewFields
      .filter((label) => display.has(label))
      .map((label) => {
        const mentions = s.entities
          .filter((e) => e.label === label)
          .sort((a, b) => a.textStart - b.textStart);
        const first = mentions[0];
        const coreType = display.get(label)!.coreType;
        return {
          label,
          displayName: display.get(label)!.displayName,
          value: first?.text ?? null,
          // Every distinct party name (co-purchasers), otherwise the first value.
          values:
            coreType === "PARTY"
              ? [...new Set(mentions.map((m) => m.text))]
              : first
                ? [first.text]
                : [],
          normalized: first ? normalizeByCoreType(coreType, first.text) : null,
          evidence: first
            ? { entityId: first.id, textStart: first.textStart, textEnd: first.textEnd }
            : null,
          coreType,
        };
      })
      // A party role absent from the document is not a role in this document
      // type (an NDA has no CLIENT); any other absent field is reported as
      // not found.
      .filter((f) => f.value !== null || f.coreType !== "PARTY");
    res.status(200).json({
      domain: pack.id,
      domainName: pack.name,
      documentType: doc.documentType,
      fields,
      detection: doc.domainDetection ?? null,
    });
  } catch (err) {
    next(err);
  }
});
