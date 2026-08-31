import { Router } from "express";
import multer from "multer";
import { getPrismaClient } from "@nyayalens/db";
import { z } from "zod";
import { env } from "../config/env.js";
import { sniffMimeType } from "../extraction/sniffFileType.js";
import { DOCX_MIME_TYPE, PDF_MIME_TYPE } from "../extraction/extractText.js";
import { enqueue } from "../jobs/queue.js";
import { runExtractionPipeline } from "../jobs/pipeline.js";
import { loadDocumentGraph } from "../graph/loadDocumentGraph.js";
import { requireAuth } from "../middleware/auth.js";
import { askRateLimiter } from "../middleware/rateLimit.js";
import { getActiveLLMProvider } from "../rag/llmProviderFactory.js";
import { getActiveRetrievalProvider } from "../rag/retrievalProviderFactory.js";
import { runAsk } from "../rag/runAsk.js";
import { getStorage } from "../storage/index.js";

const MODEL_SOURCE_VALUES = ["RULE_BASED", "GENERIC_TRANSFORMER", "FINE_TUNED"] as const;
const modelSourceQuerySchema = z.object({
  model_source: z.enum(MODEL_SOURCE_VALUES).default("RULE_BASED"),
});
const askBodySchema = z.object({
  question: z.string().min(1).max(2000),
});

const prisma = getPrismaClient();
export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

const uploadMetadataSchema = z.object({
  documentType: z.enum(["residential_rental", "land_lease"]),
  title: z.string().min(1).max(300).optional(),
});

const EXTENSION_BY_MIME: Record<string, string> = {
  [PDF_MIME_TYPE]: ".pdf",
  [DOCX_MIME_TYPE]: ".docx",
};

function getIdParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// Confirms a document exists AND belongs to the caller in one query -
// used by every route scoped to :id so ownership is never checked after
// the fact.
async function findOwnedDocumentId(documentId: string, ownerId: string): Promise<string | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, ownerId },
    select: { id: true },
  });
  return document?.id ?? null;
}

// Lists document metadata owned by the authenticated user only.
documentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { ownerId: req.auth!.userId },
      select: {
        id: true,
        title: true,
        documentType: true,
        isSynthetic: true,
        mimeType: true,
        fileSizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ documents });
  } catch (err) {
    next(err);
  }
});

// Uploads a document (.pdf or .docx), persists it via the storage adapter,
// and kicks off the extraction pipeline in the background. Responds as
// soon as the row + job exist - the caller polls GET /documents/:id (or
// its processingJobs) for extraction status rather than waiting on it here.
documentsRouter.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Missing file (multipart field name: 'file')" });
      return;
    }

    const parsed = uploadMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const mimeType = sniffMimeType(file.buffer, file.originalname);
    if (!mimeType) {
      res.status(400).json({ error: "File is not a recognizable PDF or DOCX" });
      return;
    }

    const documentType =
      parsed.data.documentType === "residential_rental" ? "RESIDENTIAL_RENTAL" : "LAND_LEASE";
    const title = parsed.data.title ?? file.originalname;

    const document = await prisma.document.create({
      data: {
        ownerId: req.auth!.userId,
        title,
        documentType,
        isSynthetic: false,
        sourceFilename: file.originalname,
        mimeType,
        fileSizeBytes: file.size,
      },
    });

    const storageKey = `${req.auth!.userId}/${document.id}${EXTENSION_BY_MIME[mimeType]}`;
    await getStorage().save(storageKey, file.buffer);
    await prisma.document.update({ where: { id: document.id }, data: { storageKey } });

    enqueue(() =>
      runExtractionPipeline(document.id).catch((err: unknown) => {
        console.error(`Extraction pipeline failed for document ${document.id}:`, err);
      }),
    );

    res.status(201).json({
      id: document.id,
      title: document.title,
      documentType: document.documentType,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      createdAt: document.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// Returns one document's metadata, page-level extraction status, and
// processing job history - owned-by-caller only.
documentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const document = await prisma.document.findFirst({
      where: { id: documentId, ownerId: req.auth!.userId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        processingJobs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.status(200).json({ document });
  } catch (err) {
    next(err);
  }
});

// Extracted entities for one document (Phase 4A). Includes every
// model_source that has run (rule_based, generic_transformer, and later
// fine_tuned) - callers filter client-side if they only want one.
documentsRouter.get("/:id/entities", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const ownedId = await findOwnedDocumentId(documentId, req.auth!.userId);
    if (!ownedId) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const entities = await prisma.entity.findMany({
      where: { documentId: ownedId },
      orderBy: { textStart: "asc" },
    });
    res.status(200).json({ entities });
  } catch (err) {
    next(err);
  }
});

// Classified clauses for one document (Phase 4A).
documentsRouter.get("/:id/clauses", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const ownedId = await findOwnedDocumentId(documentId, req.auth!.userId);
    if (!ownedId) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const clauses = await prisma.documentClause.findMany({
      where: { documentId: ownedId },
      orderBy: { textStart: "asc" },
    });
    res.status(200).json({ clauses });
  } catch (err) {
    next(err);
  }
});

// Risk findings for one document (Phase 6). Every finding carries its
// pass (1 or 2) and model_source explicitly - see risk_engine.md.
documentsRouter.get("/:id/risks", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const ownedId = await findOwnedDocumentId(documentId, req.auth!.userId);
    if (!ownedId) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const risks = await prisma.risk.findMany({
      where: { documentId: ownedId },
      orderBy: { createdAt: "asc" },
    });
    res.status(200).json({ risks });
  } catch (err) {
    next(err);
  }
});

// Knowledge graph for one document (Phase 7A). Built at read-time from
// already-persisted entities/document_clauses/risks - see
// docs/architecture/knowledge_graph.md. model_source is explicit and
// query-configurable, defaulting to RULE_BASED like every other Phase 6/7A
// consumer of these tables.
documentsRouter.get("/:id/graph", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const ownedId = await findOwnedDocumentId(documentId, req.auth!.userId);
    if (!ownedId) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const parsedQuery = modelSourceQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: parsedQuery.error.flatten() });
      return;
    }
    const graph = await loadDocumentGraph(ownedId, parsedQuery.data.model_source);
    res.status(200).json({ graph });
  } catch (err) {
    next(err);
  }
});

// RAG question answering over one document's clauses (Phase 7A). Grounded
// strictly in retrieved evidence - see docs/architecture/rag_design.md.
// Rate-limited (askRateLimiter, new in this phase - see
// middleware/rateLimit.ts) since this calls an LLM provider per request.
documentsRouter.post("/:id/ask", requireAuth, askRateLimiter, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const ownedId = await findOwnedDocumentId(documentId, req.auth!.userId);
    if (!ownedId) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const parsedBody = askBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.flatten() });
      return;
    }
    const result = await runAsk(
      ownedId,
      parsedBody.data.question,
      getActiveRetrievalProvider(),
      getActiveLLMProvider(),
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const documentId = getIdParam(req.params.id);
    if (!documentId) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const document = await prisma.document.findFirst({
      where: { id: documentId, ownerId: req.auth!.userId },
    });
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (document.storageKey) {
      await getStorage().delete(document.storageKey);
    }
    await prisma.document.delete({ where: { id: document.id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
