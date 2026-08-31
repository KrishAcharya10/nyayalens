// Loads a document's clauses/entities/risks from Postgres (filtered by
// model_source, same explicit-never-implicit discipline as Phase 6's
// runRiskEngine) and builds its knowledge graph.
import { getPrismaClient, type ModelSource } from "@nyayalens/db";
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

  const [clauses, entities, risks] = await Promise.all([
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
      select: { id: true, category: true, evidence: true },
    }),
  ]);

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
    })),
  });
}
