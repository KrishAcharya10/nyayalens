// Phase 7A addendum, Part B: is the 0.600 (pre-addendum) refusal-correctness
// result a tunable-threshold problem or a structural one? Method: compute
// the EXACT relevance() score (the same function ExtractiveLLMProvider
// itself uses - imported, not reimplemented, so this can't silently drift)
// for every retrieved chunk against every one of the 33 quality test set
// cases, then tabulate the maximum score per case, split by whether the
// case SHOULD ground (answerable) or SHOULD refuse (unanswerable). If a
// single threshold value cleanly separates the two groups, this is a
// tunable-threshold problem. If the two groups' score ranges overlap, no
// threshold value can fix it - that is a structural limitation of a
// lexical-overlap relevance signal, not a calibration miss.
//
// Usage (from apps/api):
//   dotenv -e ../../.env -- tsx scripts/analyze-refusal-scores.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import { BM25Retriever } from "../src/rag/bm25Retriever.js";
import { buildChunks } from "../src/rag/chunking.js";
import { relevance } from "../src/rag/extractiveLlmProvider.js";

const prisma = getPrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SET_PATH = path.resolve(__dirname, "../rag_eval/quality_test_set.json");
const RESULTS_PATH = path.resolve(__dirname, "../rag_eval/refusal_threshold_analysis.json");
const TOP_K = 3;

async function resolveDocumentIds(docIds) {
  const documents = await prisma.document.findMany({
    where: { owner: { email: "phase4b-eval@nyayalens.local" }, title: { in: docIds } },
    select: { id: true, title: true },
  });
  return new Map(documents.map((d) => [d.title, d.id]));
}

async function maxRelevanceForCase(documentId, question) {
  const [clauses, entities] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
  ]);
  const chunks = buildChunks(documentId, clauses, entities);
  const retrieved = BM25Retriever.retrieve(question, chunks, TOP_K).filter((r) => r.score > 0);
  const scores = retrieved.map((r) => ({
    chunkId: r.chunk.chunkId,
    chunkType: r.chunk.chunkType,
    bm25Score: r.score,
    relevanceScore: relevance(question, r.chunk.text),
    text: r.chunk.text.slice(0, 80),
  }));
  scores.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scores;
}

async function main() {
  const testSet = JSON.parse(readFileSync(TEST_SET_PATH, "utf-8"));
  const byTitle = await resolveDocumentIds(testSet.documents);

  const rows = [];
  for (const c of testSet.cases) {
    const documentId = byTitle.get(c.doc_id);
    const scores = await maxRelevanceForCase(documentId, c.question);
    const shouldGround = c.type !== "unanswerable";
    rows.push({
      id: c.id,
      type: c.type,
      shouldGround,
      question: c.question,
      maxRelevanceScore: scores.length > 0 ? scores[0].relevanceScore : 0,
      topChunk: scores[0] ?? null,
      allScores: scores,
    });
  }

  const shouldGroundScores = rows.filter((r) => r.shouldGround).map((r) => r.maxRelevanceScore);
  const shouldRefuseScores = rows.filter((r) => !r.shouldGround).map((r) => r.maxRelevanceScore);

  const shouldGroundMin = Math.min(...shouldGroundScores);
  const shouldRefuseMax = Math.max(...shouldRefuseScores);
  const shouldRefuseMin = Math.min(...shouldRefuseScores);
  const shouldGroundMax = Math.max(...shouldGroundScores);

  // A clean separating threshold exists only if every "should ground" case
  // scores strictly higher than every "should refuse" case - i.e. the
  // lowest score among cases that should answer is still above the
  // highest score among cases that should refuse.
  const cleanSeparationExists = shouldGroundMin > shouldRefuseMax;

  const overlappingRefuseCases = rows.filter(
    (r) => !r.shouldGround && r.maxRelevanceScore >= shouldGroundMin,
  );
  const overlappingGroundCases = rows.filter(
    (r) => r.shouldGround && r.maxRelevanceScore <= shouldRefuseMax,
  );

  const report = {
    generated_at: new Date().toISOString(),
    n_cases: rows.length,
    should_ground: { n: shouldGroundScores.length, min: shouldGroundMin, max: shouldGroundMax },
    should_refuse: { n: shouldRefuseScores.length, min: shouldRefuseMin, max: shouldRefuseMax },
    clean_separating_threshold_exists: cleanSeparationExists,
    finding: cleanSeparationExists ? "THRESHOLD" : "STRUCTURAL",
    overlapping_should_refuse_cases_scoring_in_should_ground_range: overlappingRefuseCases.map(
      (r) => ({
        id: r.id,
        question: r.question,
        maxRelevanceScore: r.maxRelevanceScore,
        topChunkText: r.topChunk?.text,
      }),
    ),
    overlapping_should_ground_cases_scoring_in_should_refuse_range: overlappingGroundCases.map(
      (r) => ({
        id: r.id,
        question: r.question,
        maxRelevanceScore: r.maxRelevanceScore,
        topChunkText: r.topChunk?.text,
      }),
    ),
    rows_sorted_by_score: [...rows]
      .sort((a, b) => b.maxRelevanceScore - a.maxRelevanceScore)
      .map((r) => ({
        id: r.id,
        type: r.type,
        shouldGround: r.shouldGround,
        maxRelevanceScore: Number(r.maxRelevanceScore.toFixed(4)),
        question: r.question,
      })),
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(JSON.stringify({ ...report, rows_sorted_by_score: undefined }, null, 2));
  console.log("\n--- all cases, sorted by max relevance score (descending) ---");
  for (const r of report.rows_sorted_by_score) {
    console.log(
      `${r.maxRelevanceScore.toFixed(4)}  ${r.shouldGround ? "GROUND " : "REFUSE "} ${r.id}  ${r.question}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[analyze-refusal-scores] Fatal error:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
