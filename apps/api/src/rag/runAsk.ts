// Orchestrates one /documents/:id/ask request.
//
// Phase 8 local RAG: QUESTION -> question analysis -> (structured facts |
// BM25 retrieval) -> answer -> evidence status.
//   1. A fact-seeking question ("What is the sale consideration?", "Who is
//      the licensee?", "Is the fee stated consistently?") is answered from
//      the document's own extracted facts (rag/structuredQa.ts), with the
//      exact spans as evidence - or NOT_SUFFICIENT when the document has no
//      such fact.
//   2. Anything else ("What does the termination clause say?") goes through
//      the original Phase 7A path: chunk -> BM25 -> genuinely-matched chunks
//      -> LLMProvider (extractive by default, Ollama locally if configured).
// Every answer reports evidenceStatus GROUNDED or NOT_SUFFICIENT, and every
// source its clause and page. model_source is an explicit parameter
// (default RULE_BASED), same discipline as runRiskEngine.
import { getPrismaClient, type ModelSource } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import type { EvidenceSpan, RiskFinding } from "../risk/types.js";
import { clauseAt } from "../semantic/extract.js";
import { pageAt, pageSpans } from "../semantic/facts.js";
import { buildChunks } from "./chunking.js";
import { DISCLAIMER } from "./extractiveLlmProvider.js";
import {
  answerStructured,
  uncoveredQuestionTerms,
  vocabularyOf,
  type EvidenceStatus,
} from "./structuredQa.js";
import { RAG_SYSTEM_INSTRUCTIONS } from "./systemInstructions.js";
import type { ChunkType, LLMProvider, RetrievalProvider } from "./types.js";

const prisma = getPrismaClient();

const TOP_K = 3;

const notMentioned = (terms: string[]): string =>
  `The document does not mention ${terms.map((t) => `"${t}"`).join(", ")}, so this question cannot be answered from its text.`;
// A BM25 score of exactly 0 means literally no query term matched that
// chunk at all - excluded before it ever reaches the LLMProvider, so
// "grounded: false" for a genuinely unanswerable question isn't riding on
// the provider's own judgment alone.
const MIN_BM25_SCORE = 0;

// Questions asking for the wording of a clause rather than a fact.
const CLAUSE_TEXT_REQUEST = /\bwhat does\b|\bsay\b|\bexplain\b|\bsummar|\bdescribe\b/i;

export interface AskSource {
  chunkId: string;
  documentId: string;
  chunkType: ChunkType;
  textStart: number | null;
  textEnd: number | null;
  excerpt: string;
  clauseId: string | null;
  clauseType: string | null;
  clauseNumber: string | null;
  page: number | null;
}

export interface AskResult {
  answer: string;
  /** Kept for API compatibility: true exactly when evidenceStatus is GROUNDED. */
  grounded: boolean;
  evidenceStatus: EvidenceStatus;
  method: "structured" | "retrieval";
  sources: AskSource[];
}

const EXCERPT_MAX_LENGTH = 300;

export async function runAsk(
  documentId: string,
  question: string,
  retrievalProvider: RetrievalProvider,
  llmProvider: LLMProvider,
  modelSource: ModelSource = "RULE_BASED",
): Promise<AskResult> {
  const [document, clauses, entities, pages, consistency] = await Promise.all([
    prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { documentType: true },
    }),
    prisma.documentClause.findMany({
      where: { documentId, modelSource },
      select: {
        id: true,
        clauseType: true,
        clauseNumber: true,
        text: true,
        textStart: true,
        textEnd: true,
      },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.documentPage.findMany({
      where: { documentId },
      select: { pageNumber: true, text: true },
    }),
    prisma.risk.findMany({ where: { documentId, pass: "CONSISTENCY", modelSource } }),
  ]);
  const findings: RiskFinding[] = consistency.map((r) => ({
    category: r.category as RiskFinding["category"],
    severity: r.severity,
    reason: r.reason,
    pass: "CONSISTENCY",
    evidence: r.evidence as unknown as EvidenceSpan[],
    ...(r.ruleId ? { ruleId: r.ruleId } : {}),
  }));
  return askFromFacts({
    documentId,
    documentType: document.documentType,
    question,
    clauses,
    entities,
    pages,
    findings,
    retrievalProvider,
    llmProvider,
  });
}

type StoredClause = {
  id: string;
  clauseType: string;
  clauseNumber: string | null;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
};
type StoredEntity = {
  id: string;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
};

export interface AskFromFactsInput {
  documentId: string;
  documentType: string;
  question: string;
  clauses: StoredClause[];
  entities: StoredEntity[];
  pages: Array<{ pageNumber: number; text: string | null }>;
  /** The document's consistency findings (pass CONSISTENCY). */
  findings: RiskFinding[];
  retrievalProvider: RetrievalProvider;
  llmProvider: LLMProvider;
}

/**
 * Everything runAsk does after loading the document: structured answering,
 * then retrieval. Pure over its inputs, so the evaluation harness runs
 * exactly the code the API runs.
 */
export async function askFromFacts(input: AskFromFactsInput): Promise<AskResult> {
  const {
    documentId,
    documentType,
    question,
    clauses,
    entities,
    pages,
    findings,
    retrievalProvider,
    llmProvider,
  } = input;
  const spans = pageSpans(pages);
  // Page text when stored; clause and entity text cover a document seeded without pages.
  const documentText = [
    ...pages.map((p) => p.text ?? ""),
    ...clauses.map((c) => c.text ?? ""),
    ...entities.map((e) => e.text ?? ""),
  ].join(" ");
  const semanticClauses = clauses
    .filter((c) => c.textStart !== null && c.textEnd !== null)
    .map((c) => ({ ...c, textStart: c.textStart!, textEnd: c.textEnd! }));
  const where = (start: number | null) => {
    const clause = start === null ? null : clauseAt(semanticClauses, start);
    return {
      clauseId: clause?.id ?? null,
      clauseType: clause?.clauseType ?? null,
      clauseNumber: clause?.clauseNumber ?? null,
      page: start === null ? null : pageAt(spans, start),
    };
  };

  // 1. Structured answering from the document's own facts. Skipped when the
  // document has no extracted facts at all (extraction never ran), in which
  // case retrieval is the only honest source.
  if (!CLAUSE_TEXT_REQUEST.test(question) && entities.length > 0) {
    const registry = getDomainPackRegistry();
    const pack = registry.forDocumentType(documentType);
    const structured = answerStructured({
      question,
      pack,
      entities: entities
        .filter((e) => e.text !== null && e.textStart !== null && e.textEnd !== null)
        .map((e) => ({ ...e, text: e.text!, textStart: e.textStart!, textEnd: e.textEnd! })),
      findings,
      allPacks: registry.list(),
    });
    // A question that asks about something the text never mentions is not answered
    // by the nearest fact that happens to share a word with it.
    const uncovered =
      structured && structured.status === "GROUNDED" && structured.kind !== "consistency"
        ? uncoveredQuestionTerms(
            question,
            documentText,
            vocabularyOf(pack, structured.resolvedLabels),
          )
        : [];
    if (uncovered.length > 0) {
      return {
        answer: notMentioned(uncovered),
        grounded: false,
        evidenceStatus: "NOT_SUFFICIENT",
        method: "structured",
        sources: [],
      };
    }
    if (structured) {
      const grounded = structured.status === "GROUNDED";
      return {
        answer: !grounded
          ? structured.answer
          : structured.kind === "conflict"
            ? `${structured.answer} ${DISCLAIMER}`
            : `The document states: ${structured.answer} ${DISCLAIMER}`,
        grounded,
        evidenceStatus: structured.status,
        method: "structured",
        sources: structured.evidence.map((e) => ({
          chunkId: e.entityId ?? `${e.textStart}-${e.textEnd}`,
          documentId,
          chunkType: "entity" as const,
          textStart: e.textStart,
          textEnd: e.textEnd,
          excerpt: e.text,
          ...where(e.textStart),
        })),
      };
    }
  }

  // 2. Retrieval (Phase 7A path). A question about a term the document never
  // uses is refused before retrieval can match it to something merely nearby.
  const unmentioned = uncoveredQuestionTerms(question, documentText);
  if (unmentioned.length > 0) {
    return {
      answer: notMentioned(unmentioned),
      grounded: false,
      evidenceStatus: "NOT_SUFFICIENT",
      method: "retrieval",
      sources: [],
    };
  }
  const chunks = buildChunks(documentId, clauses, entities);
  const retrieved = retrievalProvider
    .retrieve(question, chunks, TOP_K)
    .filter((r) => r.score > MIN_BM25_SCORE);
  const evidence = retrieved.map((r) => ({
    chunkId: r.chunk.chunkId,
    documentId: r.chunk.documentId,
    chunkType: r.chunk.chunkType,
    textStart: r.chunk.textStart,
    textEnd: r.chunk.textEnd,
    text: r.chunk.text,
  }));
  const result = await llmProvider.generate({
    systemInstructions: RAG_SYSTEM_INSTRUCTIONS,
    question,
    evidence,
  });
  const citedIds = new Set(result.citedChunkIds ?? evidence.map((e) => e.chunkId));
  const sources: AskSource[] = evidence
    .filter((e) => citedIds.has(e.chunkId))
    .map((e) => ({
      chunkId: e.chunkId,
      documentId: e.documentId,
      chunkType: e.chunkType,
      textStart: e.textStart,
      textEnd: e.textEnd,
      excerpt:
        e.text.length > EXCERPT_MAX_LENGTH ? `${e.text.slice(0, EXCERPT_MAX_LENGTH)}...` : e.text,
      ...where(e.textStart),
    }));
  // A grounded answer must cite something; otherwise it is not grounded.
  const grounded = result.grounded && sources.length > 0;
  return {
    answer: result.answer,
    grounded,
    evidenceStatus: grounded ? "GROUNDED" : "NOT_SUFFICIENT",
    method: "retrieval",
    sources: grounded ? sources : [],
  };
}
