// Loads one document's semantic layer from persisted rows: entities and
// clauses (pipeline output), relations and obligations (semantic_extraction
// stage), pages (for page numbers), and builds the semantic facts from
// them. Read-time and deterministic, like the knowledge graph.
import { getPrismaClient, type ModelSource } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import type { ExtractedObligation, ExtractedRelation } from "./extract.js";
import { buildSemanticFacts, pageSpans, type SemanticFactSet } from "./facts.js";
import type { SemanticClause, SemanticEntity } from "./types.js";

const prisma = getPrismaClient();

export interface DocumentSemantics {
  documentId: string;
  documentType: string;
  domain: string;
  text: string;
  entities: SemanticEntity[];
  clauses: SemanticClause[];
  relations: ExtractedRelation[];
  obligations: ExtractedObligation[];
  semantic: SemanticFactSet;
}

export async function loadDocumentSemantics(
  documentId: string,
  modelSource: ModelSource = "RULE_BASED",
): Promise<DocumentSemantics> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { documentType: true, canonicalText: true },
  });
  const pack = getDomainPackRegistry().forDocumentType(document.documentType);
  const [entityRows, clauseRows, relationRows, obligationRows, pages] = await Promise.all([
    prisma.entity.findMany({ where: { documentId, modelSource } }),
    prisma.documentClause.findMany({ where: { documentId, modelSource } }),
    prisma.relation.findMany({ where: { documentId, modelSource } }),
    prisma.obligation.findMany({
      where: { documentId, modelSource },
      orderBy: { textStart: "asc" },
    }),
    prisma.documentPage.findMany({
      where: { documentId },
      select: { pageNumber: true, text: true },
    }),
  ]);
  const entities: SemanticEntity[] = entityRows
    .filter((e) => e.text !== null && e.textStart !== null && e.textEnd !== null)
    .map((e) => ({
      id: e.id,
      label: e.label,
      text: e.text!,
      textStart: e.textStart!,
      textEnd: e.textEnd!,
      modelSource: e.modelSource,
    }));
  const clauses: SemanticClause[] = clauseRows
    .filter((c) => c.textStart !== null && c.textEnd !== null)
    .map((c) => ({
      id: c.id,
      clauseType: c.clauseType,
      clauseNumber: c.clauseNumber,
      textStart: c.textStart!,
      textEnd: c.textEnd!,
    }));
  const labelOf = new Map(entities.map((e) => [e.id, e.label]));
  const relations: ExtractedRelation[] = relationRows.map((r) => ({
    relationType: r.relationType,
    subjectLabel: r.subjectEntityId ? (labelOf.get(r.subjectEntityId) ?? "UNKNOWN") : "DOCUMENT",
    subjectEntityId: r.subjectEntityId,
    objectLabel: labelOf.get(r.objectEntityId) ?? "UNKNOWN",
    objectEntityId: r.objectEntityId,
    sourceClauseId: r.sourceClauseId,
    textStart: r.textStart ?? 0,
    textEnd: r.textEnd ?? 0,
    modelName: r.modelName ?? "",
  }));
  const allowed = new Map(pack.obligationSchema.map((o) => [o.action, new Set(o.actorLabels)]));
  const obligations: ExtractedObligation[] = obligationRows.map((o) => ({
    actorLabel: o.actorLabel ?? "UNKNOWN",
    actorEntityId: o.actorEntityId,
    actorText: o.obligedParty ?? "",
    action: o.action ?? "UNKNOWN",
    unexpectedActor: !(allowed.get(o.action ?? "")?.has(o.actorLabel ?? "") ?? false),
    amountEntityId: o.amountEntityId,
    amountLabel: o.objectText,
    amountInr: o.amountInr,
    deadlineEntityId: null,
    deadlineIso: o.dueDate ? o.dueDate.toISOString().slice(0, 10) : null,
    deadlineText: o.deadlineText,
    frequency: (o.frequency as ExtractedObligation["frequency"]) ?? null,
    condition: o.condition,
    sourceClauseId: o.sourceClauseId,
    textStart: o.textStart ?? 0,
    textEnd: o.textEnd ?? 0,
    evidenceText: o.description ?? "",
    modelName: o.modelName ?? "",
  }));
  const text = document.canonicalText ?? "";
  const semantic = buildSemanticFacts({
    documentId,
    pack,
    text,
    pages: pageSpans(pages),
    entities,
    clauses,
    relations,
    obligations,
  });
  return {
    documentId,
    documentType: document.documentType,
    domain: pack.id,
    text,
    entities,
    clauses,
    relations,
    obligations,
    semantic,
  };
}
