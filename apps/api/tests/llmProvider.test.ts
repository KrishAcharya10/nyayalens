import { describe, expect, it } from "vitest";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
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
