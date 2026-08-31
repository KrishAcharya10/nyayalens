// Orchestrates one /documents/:id/ask request: chunk -> retrieve -> filter
// to genuinely-matched chunks -> generate. model_source is an explicit
// parameter (default RULE_BASED), same discipline as Phase 6's
// runRiskEngine - never a hardcoded assumption.
//
// Addendum: chunks now come from both clauses and preamble-only entities
// (buildChunks, not buildChunksFromClauses alone) - see chunking.ts for
// why. Nothing else about the retrieve/generate flow changed.
import { getPrismaClient, type ModelSource } from "@nyayalens/db";
import { buildChunks } from "./chunking.js";
import { RAG_SYSTEM_INSTRUCTIONS } from "./systemInstructions.js";
import type { ChunkType, LLMProvider, RetrievalProvider } from "./types.js";

const prisma = getPrismaClient();

const TOP_K = 3;
// A BM25 score of exactly 0 means literally no query term matched that
// chunk at all - excluded before it ever reaches the LLMProvider, so
// "grounded: false" for a genuinely unanswerable question isn't riding on
// the provider's own judgment alone.
const MIN_BM25_SCORE = 0;

export interface AskSource {
  chunkId: string;
  documentId: string;
  chunkType: ChunkType;
  textStart: number | null;
  textEnd: number | null;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  grounded: boolean;
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
  const [clauses, entities] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource },
      select: { id: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
  ]);
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
    }));

  return { answer: result.answer, grounded: result.grounded, sources };
}
