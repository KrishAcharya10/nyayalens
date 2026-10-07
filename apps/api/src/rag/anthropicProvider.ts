// Anthropic Messages API client (Phase 7A). IMPLEMENTED BUT NOT VERIFIED
// in this environment - no ANTHROPIC_API_KEY is configured anywhere here
// (checked .env, .env.example, and the shell environment - see
// rag_design.md). Selected via LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY;
// ExtractiveLLMProvider (the verified default) is used otherwise, same
// opt-in-with-honest-fallback pattern as Phase 4A's ML_SERVICE_PYTHON.
//
// Uses a plain fetch() call against the documented Messages API rather
// than the @anthropic-ai/sdk package - this code path is unverified and
// doesn't warrant adding an untested dependency for it.
import { buildEvidenceUserContent } from "./evidencePrompt.js";
import type { LLMAnswer, LLMProvider, LLMRequest } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
}

export function createAnthropicProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: "anthropic",
    async generate(request: LLMRequest): Promise<LLMAnswer> {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system: request.systemInstructions,
          messages: [{ role: "user", content: buildEvidenceUserContent(request) }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API request failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as AnthropicMessageResponse;
      const text = body.content?.find((c) => c.type === "text")?.text ?? "";
      // Unverified approximation, not a confirmed behavior: without a real
      // run against this path, "grounded" here can only mean "evidence was
      // available to answer from," not "the model actually used it
      // correctly." A future phase that activates this provider should
      // replace this with the same citation-correctness checking
      // evaluate-rag.mjs applies to ExtractiveLLMProvider.
      return { answer: text, grounded: request.evidence.length > 0 };
    },
  };
}
