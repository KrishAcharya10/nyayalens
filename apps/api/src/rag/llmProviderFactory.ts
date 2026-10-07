import { env } from "../config/env.js";
import { createAnthropicProvider } from "./anthropicProvider.js";
import { ExtractiveLLMProvider } from "./extractiveLlmProvider.js";
import { createOllamaProvider } from "./ollamaProvider.js";
import type { LLMProvider } from "./types.js";

// ExtractiveLLMProvider is the only LLMProvider actually verified to work
// in this environment (no LLM API key configured anywhere - see
// rag_design.md), and is the default and fallback. LLM_PROVIDER=anthropic
// activates AnthropicProvider only when ANTHROPIC_API_KEY is also set;
// implemented but explicitly unverified either way.
// LLM_PROVIDER=ollama selects the fully-local generative provider (no key
// needed; it falls back to extractive per request if Ollama isn't running).
export function getActiveLLMProvider(): LLMProvider {
  if (env.LLM_PROVIDER === "ollama") {
    return createOllamaProvider({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
      timeoutMs: env.OLLAMA_TIMEOUT_MS,
    });
  }
  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn(
        "[rag] LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set - falling back to extractive.",
      );
      return ExtractiveLLMProvider;
    }
    return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  return ExtractiveLLMProvider;
}
