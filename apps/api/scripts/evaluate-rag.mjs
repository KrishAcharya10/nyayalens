// Phase 7A RAG quality evaluation (updated by the Phase 7A addendum for
// preamble-entity chunks). Runs apps/api/rag_eval/quality_test_set.json
// (authored by the same process that built this pipeline - see the test
// set file's own note and rag_evaluation_results.md's same-team-designs-both
// caveat) against the real, already-uploaded synthetic documents under
// phase4b-eval@nyayalens.local, and reports, honestly and per Phase 4B/6's
// standing no-fabrication rule:
//   - retrieval hit rate (Recall@K): did a chunk from an expected clause
//     (or, for factual_preamble cases, the expected entity) end up in the
//     top-k retrieved chunks
//   - refusal correctness: were the genuinely-unanswerable questions
//     actually refused (grounded: false), not answered anyway
//   - citation/evidence correctness: for every grounded answer, does each
//     expected fact actually appear in the CITED excerpt(s), not just
//     somewhere in whatever was retrieved
//   - grounded-answer rate: overall, across the factual + factual_preamble
//     + multi-clause cases
//
// Usage (from apps/api):
//   dotenv -e ../../.env -- tsx scripts/evaluate-rag.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import { BM25Retriever } from "../src/rag/bm25Retriever.js";
import { buildChunks } from "../src/rag/chunking.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { runAsk } from "../src/rag/runAsk.js";

const prisma = getPrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SET_PATH = path.resolve(__dirname, "../rag_eval/quality_test_set.json");
const RESULTS_PATH = path.resolve(__dirname, "../rag_eval/quality_results.json");
const TOP_K = 3;
const ANSWERABLE_TYPES = new Set(["factual", "factual_preamble", "multi_clause"]);

async function resolveDocumentIds(docIds) {
  const documents = await prisma.document.findMany({
    where: { owner: { email: "phase4b-eval@nyayalens.local" }, title: { in: docIds } },
    select: { id: true, title: true },
  });
  const byTitle = new Map(documents.map((d) => [d.title, d.id]));
  for (const docId of docIds) {
    if (!byTitle.has(docId)) {
      throw new Error(
        `${docId} not found under phase4b-eval@nyayalens.local - run bulk-upload-synthetic.mjs first`,
      );
    }
  }
  return byTitle;
}

async function loadChunksFor(documentId) {
  const [clauses, entities] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, clauseNumber: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
  ]);
  const chunks = buildChunks(documentId, clauses, entities);
  const clauseNumberByChunkId = new Map(clauses.map((c) => [c.id, c.clauseNumber]));
  const entityLabelByChunkId = new Map(entities.map((e) => [e.id, e.label]));
  return { chunks, clauseNumberByChunkId, entityLabelByChunkId };
}

async function retrievalHit(documentId, question, testCase) {
  const { chunks, clauseNumberByChunkId, entityLabelByChunkId } = await loadChunksFor(documentId);
  const retrieved = BM25Retriever.retrieve(question, chunks, TOP_K).filter((r) => r.score > 0);

  if (testCase.type === "factual_preamble") {
    const retrievedLabels = new Set(
      retrieved.map((r) => entityLabelByChunkId.get(r.chunk.chunkId)).filter(Boolean),
    );
    const hit = retrievedLabels.has(testCase.expected_entity_label);
    return { hitAny: hit, hitAll: hit };
  }

  const retrievedClauseNumbers = new Set(
    retrieved.map((r) => clauseNumberByChunkId.get(r.chunk.chunkId)).filter(Boolean),
  );
  const expected = testCase.expected_clause_numbers;
  const hitAny = expected.some((n) => retrievedClauseNumbers.has(n));
  const hitAll = expected.every((n) => retrievedClauseNumbers.has(n));
  return { hitAny, hitAll };
}

function citationCorrect(askResult, expectedAnswerContains) {
  const citedText = askResult.sources.map((s) => s.excerpt.toLowerCase()).join(" | ");
  return expectedAnswerContains.every((term) => citedText.includes(term.toLowerCase()));
}

async function main() {
  const testSet = JSON.parse(readFileSync(TEST_SET_PATH, "utf-8"));
  const byTitle = await resolveDocumentIds(testSet.documents);

  const results = [];
  for (const c of testSet.cases) {
    const documentId = byTitle.get(c.doc_id);
    const askResult = await runAsk(documentId, c.question, BM25Retriever, ExtractiveLLMProvider);

    const entry = {
      id: c.id,
      type: c.type,
      question: c.question,
      grounded: askResult.grounded,
      answer: askResult.answer,
      citedChunkTypes: askResult.sources.map((s) => s.chunkType),
    };

    if (c.type === "unanswerable") {
      entry.refusedCorrectly = askResult.grounded === false;
    } else {
      const { hitAny, hitAll } = await retrievalHit(documentId, c.question, c);
      entry.retrievalHitAny = hitAny;
      entry.retrievalHitAll = hitAll;
      entry.citationCorrect = askResult.grounded
        ? citationCorrect(askResult, c.expected_answer_contains)
        : null;
    }

    results.push(entry);
  }

  const answerable = results.filter((r) => ANSWERABLE_TYPES.has(r.type));
  const unanswerable = results.filter((r) => r.type === "unanswerable");

  const retrievalHitRateAny =
    answerable.filter((r) => r.retrievalHitAny).length / answerable.length;
  const retrievalHitRateAll =
    answerable.filter((r) => r.retrievalHitAll).length / answerable.length;
  const groundedAnswerRate = answerable.filter((r) => r.grounded).length / answerable.length;
  const groundedCases = answerable.filter((r) => r.grounded);
  const citationCorrectnessRate =
    groundedCases.length > 0
      ? groundedCases.filter((r) => r.citationCorrect).length / groundedCases.length
      : null;
  const refusalCorrectnessRate =
    unanswerable.filter((r) => r.refusedCorrectly).length / unanswerable.length;

  const report = {
    generated_at: new Date().toISOString(),
    n_cases: results.length,
    n_answerable: answerable.length,
    n_unanswerable: unanswerable.length,
    retrieval_hit_rate_at_k: {
      k: TOP_K,
      any_expected: retrievalHitRateAny,
      all_expected: retrievalHitRateAll,
    },
    grounded_answer_rate: groundedAnswerRate,
    citation_correctness_rate: citationCorrectnessRate,
    citation_correctness_n: groundedCases.length,
    refusal_correctness_rate: refusalCorrectnessRate,
    per_case: results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(JSON.stringify({ ...report, per_case: undefined }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[evaluate-rag] Fatal error:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
