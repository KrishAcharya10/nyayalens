// Loads a document's clauses/entities/risks from Postgres (filtered by
// model_source, same explicit-never-implicit discipline as Phase 6's
// runRiskEngine) and builds its knowledge graph.
import { getPrismaClient, type ModelSource } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import { buildDocumentGraph } from "./buildGraph.js";
import type { DocumentGraph, GraphEvidenceInput } from "./types.js";

const prisma = getPrismaClient();

function parseEvidence(raw: unknown): GraphEvidenceInput[] {
  if (!Array.isArray(raw)) return [];
  const out: GraphEvidenceInput[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "sourceTable" in item &&
      "sourceId" in item &&
      (item.sourceTable === "document_clauses" || item.sourceTable === "entities") &&
      typeof item.sourceId === "string"
    ) {
      out.push({ sourceTable: item.sourceTable, sourceId: item.sourceId });
    }
  }
  return out;
}

export async function loadDocumentGraph(
  documentId: string,
  modelSource: ModelSource = "RULE_BASED",
): Promise<DocumentGraph> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { documentType: true },
  });

  const [clauses, entities, risks, relations, obligations] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource },
      select: { id: true, clauseType: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.risk.findMany({
      where: { documentId, modelSource },
      select: { id: true, category: true, evidence: true, pass: true },
    }),
    prisma.relation.findMany({
      where: { documentId, modelSource },
      select: { relationType: true, subjectEntityId: true, objectEntityId: true },
    }),
    prisma.obligation.findMany({
      where: { documentId, modelSource },
      select: {
        id: true,
        action: true,
        actorEntityId: true,
        amountEntityId: true,
        deadlineText: true,
        description: true,
        textStart: true,
        textEnd: true,
      },
    }),
  ]);
  const pack = getDomainPackRegistry().forDocumentType(document.documentType);

  return buildDocumentGraph({
    documentId,
    documentType: document.documentType,
    modelSource,
    clauses,
    entities,
    risks: risks.map((r) => ({
      id: r.id,
      category: r.category,
      evidence: parseEvidence(r.evidence),
      pass: r.pass,
    })),
    entityCategories: Object.fromEntries(pack.entitySchema.map((e) => [e.label, e.coreType])),
    relations,
    obligations: obligations.map((o) => ({
      id: o.id,
      action: o.action ?? "OBLIGATION",
      actorEntityId: o.actorEntityId,
      amountEntityId: o.amountEntityId,
      deadline: o.deadlineText,
      text: o.description,
      textStart: o.textStart,
      textEnd: o.textEnd,
    })),
    legalReferences: pack.legalFrameworks.map((f) => ({
      id: f.id,
      title: f.title,
      verification: f.verification ?? "UNVERIFIED",
    })),
  });
}
