import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "../src/rag/ollamaProvider.js";
import type { LLMRequest } from "../src/rag/types.js";

const provider = createOllamaProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "test-model",
  timeoutMs: 1000,
});

const request: LLMRequest = {
  systemInstructions: "system instructions",
  question: "What is the security deposit?",
  evidence: [
    {
      chunkId: "c-deposit",
      documentId: "doc-1",
      chunkType: "clause",
      textStart: 0,
      textEnd: 70,
      text: "3. SECURITY DEPOSIT\nThe Tenant shall pay a security deposit of Rs 150000.",
    },
    {
      chunkId: "c-rent",
      documentId: "doc-1",
      chunkType: "clause",
      textStart: 71,
      textEnd: 130,
      text: "2. RENT PAYMENT\nMonthly rent shall be Rs 25000.",
    },
  ],
};

function mockOllamaReply(content: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OllamaProvider (local LLM)", () => {
  it("returns a grounded answer citing only the evidence the model named", async () => {
    const fetchMock = mockOllamaReply({
      answer: "The security deposit is Rs 150000.",
      grounded: true,
      cited_evidence: [0],
    });
    const result = await provider.generate(request);

    expect(result.grounded).toBe(true);
    expect(result.citedChunkIds).toEqual(["c-deposit"]);
    expect(result.answer).toContain("Rs 150000");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(false);
  });

  it("drops hallucinated citation indices and refuses when none are valid", async () => {
    mockOllamaReply({ answer: "The deposit is huge.", grounded: true, cited_evidence: [7, -1] });
    const result = await provider.generate(request);
    expect(result.grounded).toBe(false);
    expect(result.citedChunkIds).toEqual([]);
  });

  it("refuses without calling the model when nothing was retrieved", async () => {
    const fetchMock = mockOllamaReply({ answer: "x", grounded: true, cited_evidence: [0] });
    const result = await provider.generate({ ...request, evidence: [] });
    expect(result.grounded).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the extractive provider when the Ollama server is unreachable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await provider.generate(request);
    // Extractive quotes the matching clause verbatim.
    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("security deposit of Rs 150000");
  });

  it("falls back to extractive on malformed model output", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockOllamaReply({ text: "not the contract" });
    const result = await provider.generate(request);
    expect(result.answer).toContain("security deposit of Rs 150000");
  });
});
