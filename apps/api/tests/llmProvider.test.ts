import { describe, expect, it } from "vitest";
import { ExtractiveLLMProvider, relevance } from "../src/rag/extractiveLlmProvider.js";
import type { LLMAnswer, LLMProvider, LLMRequest } from "../src/rag/types.js";
import { containsDefinitiveJudgment } from "../src/risk/reasonFraming.js";

// A trivial second LLMProvider implementation - a test double, not a
// production provider - that always echoes a fixed string. Exists solely
// to prove calling code depends only on the LLMProvider interface, the
// same way llmProviderFactory.ts's real choice between ExtractiveLLMProvider
// and AnthropicProvider does.
const EchoStubLLMProvider: LLMProvider = {
  name: "echo-stub",
  generate(request: LLMRequest): Promise<LLMAnswer> {
    return Promise.resolve({
      answer: `stub-echo: ${request.question}`,
      grounded: request.evidence.length > 0,
    });
  },
};

async function runGenerate(provider: LLMProvider, request: LLMRequest) {
  // Calling code that only knows about the LLMProvider interface - this is
  // exactly what runAsk.ts does with whichever provider the factory hands it.
  return provider.generate(request);
}

describe("LLMProvider swappability (Phase 7A)", () => {
  const baseRequest: LLMRequest = {
    systemInstructions: "system instructions",
    question: "What is the security deposit?",
    evidence: [
      {
        chunkId: "c1",
        documentId: "doc-1",
        chunkType: "clause",
        textStart: 0,
        textEnd: 60,
        text: "3. SECURITY DEPOSIT\nThe Tenant shall pay a security deposit of Rs 150000.",
      },
    ],
  };

  it("runs the same request against ExtractiveLLMProvider and a stub second implementation via one interface", async () => {
    const extractiveAnswer = await runGenerate(ExtractiveLLMProvider, baseRequest);
    const stubAnswer = await runGenerate(EchoStubLLMProvider, baseRequest);

    expect(extractiveAnswer.grounded).toBe(true);
    expect(extractiveAnswer.answer).toContain("security deposit");

    expect(stubAnswer.answer).toBe(`stub-echo: ${baseRequest.question}`);
    expect(stubAnswer.grounded).toBe(true);
  });

  it("ExtractiveLLMProvider refuses (grounded: false) when no evidence is relevant to the question", async () => {
    const result = await ExtractiveLLMProvider.generate({
      ...baseRequest,
      question: "What is the penalty for keeping unauthorized pets?",
    });
    expect(result.grounded).toBe(false);
    expect(result.citedChunkIds).toEqual([]);
  });

  it("ExtractiveLLMProvider refuses when no evidence was retrieved at all", async () => {
    const result = await ExtractiveLLMProvider.generate({ ...baseRequest, evidence: [] });
    expect(result.grounded).toBe(false);
  });

  it("ExtractiveLLMProvider's answers never use definitive legal-judgment language - reuses Phase 6's framing rule", async () => {
    const grounded = await ExtractiveLLMProvider.generate(baseRequest);
    expect(containsDefinitiveJudgment(grounded.answer), grounded.answer).toBe(false);

    const refused = await ExtractiveLLMProvider.generate({ ...baseRequest, evidence: [] });
    expect(containsDefinitiveJudgment(refused.answer), refused.answer).toBe(false);
  });
});

// Phase 7A addendum, Part B: is refusal-correctness a tunable-threshold
// problem or a structural one? Investigated with real data across all 33
// quality-test-set cases (apps/api/scripts/analyze-refusal-scores.mjs,
// results in apps/api/rag_eval/refusal_threshold_analysis.json) - finding:
// STRUCTURAL. The "should ground" score range [0.143, 1.0] fully contains
// the "should refuse" score range [0.143, 0.364]; a genuinely-answerable
// case (M6) and a genuinely-unanswerable one (U1) tied exactly at 0.1429
// against two different clauses in that real run. This test documents the
// same phenomenon with one clean, self-contained, single-evidence-text
// example so it has a concrete regression target, independent of the live
// database's exact document content.
describe("ExtractiveLLMProvider relevance scoring: a documented structural limitation (Phase 7A addendum)", () => {
  it("cannot distinguish a genuinely-answerable question from a topically-similar-but-unanswerable one against the same clause", () => {
    const noticeClause =
      "4. TERMINATION NOTICE\nEither party may terminate this Agreement by giving 30 days' written notice to the other party.";

    // Genuinely answerable - the clause directly states the notice period.
    const answerableScore = relevance(
      "What notice period is required to terminate the agreement?",
      noticeClause,
    );
    // Genuinely NOT answerable - the clause never mentions a fee, only a
    // notice period, but shares enough surface vocabulary
    // ("termination", "notice") to score identically under lexical
    // overlap alone.
    const unanswerableScore = relevance(
      "What is the fee charged for giving termination notice?",
      noticeClause,
    );

    // This is the structural problem, made concrete: not "close," but an
    // EXACT tie. No MIN_RELEVANCE value can accept the first question and
    // reject the second when they score identically against the same
    // evidence. Future work to actually fix this (not implemented in this
    // addendum - see rag_design.md/rag_evaluation_results.md) would need a
    // different signal entirely: e.g. a secondary answerability
    // classifier, or requiring the retrieved excerpt to contain an
    // answer-shaped span matching the question's expected answer type,
    // not just shared vocabulary.
    expect(unanswerableScore).toBe(answerableScore);
    expect(unanswerableScore).toBeGreaterThan(0);
  });
});
