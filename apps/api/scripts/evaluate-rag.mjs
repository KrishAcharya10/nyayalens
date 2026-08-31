// Phase 7A RAG quality evaluation. Runs apps/api/rag_eval/quality_test_set.json
// (authored by the same process that built this pipeline - see the test
// set file's own note and rag_evaluation_results.md's same-team-designs-both
// caveat) against the real, already-uploaded synthetic documents under
// phase4b-eval@nyayalens.local, and reports, honestly and per Phase 4B/6's
// standing no-fabrication rule:
//   - retrieval hit rate (Recall@K): did a chunk from an expected clause
//     end up in the top-k retrieved chunks
//   - refusal correctness: were the 5 genuinely-unanswerable questions
//     actually refused (grounded: false), not answered anyway
//   - citation/evidence correctness: for every grounded answer, does each
//     expected fact actually appear in the CITED excerpt(s), not just
//     somewhere in whatever was retrieved
//   - grounded-answer rate: overall, across the factual + multi-clause cases
//
// Usage (from apps/api):
//   dotenv -e ../../.env -- tsx scripts/evaluate-rag.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import { BM25Retriever } from "../src/rag/bm25Retriever.js";
import { buildChunksFromClauses } from "../src/rag/chunking.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { runAsk } from "../src/rag/runAsk.js";

const prisma = getPrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SET_PATH = path.resolve(__dirname, "../rag_eval/quality_test_set.json");
const RESULTS_PATH = path.resolve(__dirname, "../rag_eval/quality_results.json");
const TOP_K = 3;

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

async function retrievalHit(documentId, question, expectedClauseNumbers) {
  const clauses = await prisma.documentClause.findMany({
    where: { documentId, modelSource: "RULE_BASED" },
    select: { id: true, clauseNumber: true, text: true, textStart: true, textEnd: true },
  });
  const chunks = buildChunksFromClauses(documentId, clauses);
  const retrieved = BM25Retriever.retrieve(question, chunks, TOP_K).filter((r) => r.score > 0);
  const clauseNumberById = new Map(clauses.map((c) => [c.id, c.clauseNumber]));
  const retrievedClauseNumbers = new Set(
    retrieved.map((r) => clauseNumberById.get(r.chunk.chunkId)),
  );
  const hitAny = expectedClauseNumbers.some((n) => retrievedClauseNumbers.has(n));
  const hitAll = expectedClauseNumbers.every((n) => retrievedClauseNumbers.has(n));
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
    };

    if (c.type === "unanswerable") {
      entry.refusedCorrectly = askResult.grounded === false;
    } else {
      const { hitAny, hitAll } = await retrievalHit(
        documentId,
        c.question,
        c.expected_clause_numbers,
      );
      entry.retrievalHitAny = hitAny;
      entry.retrievalHitAll = hitAll;
      entry.citationCorrect = askResult.grounded
        ? citationCorrect(askResult, c.expected_answer_contains)
        : null;
    }

    results.push(entry);
  }

  const factualAndMulti = results.filter((r) => r.type !== "unanswerable");
  const unanswerable = results.filter((r) => r.type === "unanswerable");

  const retrievalHitRateAny =
    factualAndMulti.filter((r) => r.retrievalHitAny).length / factualAndMulti.length;
  const retrievalHitRateAll =
    factualAndMulti.filter((r) => r.retrievalHitAll).length / factualAndMulti.length;
  const groundedAnswerRate =
    factualAndMulti.filter((r) => r.grounded).length / factualAndMulti.length;
  const groundedCases = factualAndMulti.filter((r) => r.grounded);
  const citationCorrectnessRate =
    groundedCases.length > 0
      ? groundedCases.filter((r) => r.citationCorrect).length / groundedCases.length
      : null;
  const refusalCorrectnessRate =
    unanswerable.filter((r) => r.refusedCorrectly).length / unanswerable.length;

  const report = {
    generated_at: new Date().toISOString(),
    n_cases: results.length,
    n_factual_and_multi_clause: factualAndMulti.length,
    n_unanswerable: unanswerable.length,
    retrieval_hit_rate_at_k: {
      k: TOP_K,
      any_expected_clause: retrievalHitRateAny,
      all_expected_clauses: retrievalHitRateAll,
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
