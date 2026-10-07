// Local generative LLMProvider: talks to an Ollama server on this machine
// (https://ollama.com - default http://127.0.0.1:11434), so /ask can
// produce real generated answers with no cloud API and no key. Selected via
// LLM_PROVIDER=ollama.
//
// Unlike anthropicProvider.ts, grounding here is NOT taken on the model's
// word. The model must return structured JSON naming which evidence items
// it used (enforced via Ollama's `format` JSON-schema option), and this
// provider then checks that claim itself:
//   - no evidence retrieved            -> refuse without calling the model
//   - cited indices outside the range  -> dropped (a hallucinated citation)
//   - "grounded" but no valid citation -> treated as a refusal
//   - a definitive legal judgment      -> replaced by the extractive answer
//     (reasonFraming.ts's standing non-definitive-framing rule)
// If the server is unreachable or returns malformed output, the request
// falls back to ExtractiveLLMProvider with a logged warning rather than
// failing /ask outright - same honest-fallback pattern as the factory's.
import { containsDefinitiveJudgment } from "../risk/reasonFraming.js";
import { buildEvidenceUserContent } from "./evidencePrompt.js";
import { DISCLAIMER, ExtractiveLLMProvider } from "./extractiveLlmProvider.js";
import type { LLMAnswer, LLMProvider, LLMRequest } from "./types.js";

const NOT_ENOUGH_INFO = "The document does not contain enough information to answer this question.";

const OUTPUT_CONTRACT =
  "\n\nRespond with JSON only, matching this shape: " +
  '{"answer": string, "grounded": boolean, "cited_evidence": number[]}. ' +
  "`cited_evidence` lists the index attribute of every evidence item your answer relies on. " +
  "If the evidence does not answer the question, set grounded to false, cited_evidence to [], " +
  "and say the document does not contain enough information.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    grounded: { type: "boolean" },
    cited_evidence: { type: "array", items: { type: "integer" } },
  },
  required: ["answer", "grounded", "cited_evidence"],
};

interface OllamaChatResponse {
  message?: { content?: string };
}

interface ModelOutput {
  answer: string;
  grounded: boolean;
  cited_evidence: number[];
}

function parseModelOutput(raw: string): ModelOutput | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ModelOutput>;
    if (
      typeof parsed.answer !== "string" ||
      typeof parsed.grounded !== "boolean" ||
      !Array.isArray(parsed.cited_evidence)
    ) {
      return null;
    }
    return parsed as ModelOutput;
  } catch {
    return null;
  }
}

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function createOllamaProvider(options: OllamaProviderOptions): LLMProvider {
  const fallback = (request: LLMRequest, reason: string): Promise<LLMAnswer> => {
    console.warn(`[rag] ollama: ${reason} - answering with the extractive provider instead.`);
    return ExtractiveLLMProvider.generate(request);
  };

  return {
    name: "ollama",
    async generate(request: LLMRequest): Promise<LLMAnswer> {
      if (request.evidence.length === 0) {
        return { answer: NOT_ENOUGH_INFO, grounded: false, citedChunkIds: [] };
      }

      let raw: string;
      try {
        const res = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(options.timeoutMs),
          body: JSON.stringify({
            model: options.model,
            stream: false,
            format: RESPONSE_SCHEMA,
            options: { temperature: 0 },
            messages: [
              { role: "system", content: request.systemInstructions + OUTPUT_CONTRACT },
              { role: "user", content: buildEvidenceUserContent(request) },
            ],
          }),
        });
        if (!res.ok) return await fallback(request, `HTTP ${res.status}`);
        raw = ((await res.json()) as OllamaChatResponse).message?.content ?? "";
      } catch (err) {
        return fallback(request, err instanceof Error ? err.message : String(err));
      }

      const output = parseModelOutput(raw);
      if (!output) return fallback(request, "model returned malformed JSON");

      const citedChunkIds = [
        ...new Set(
          output.cited_evidence
            .filter((i) => Number.isInteger(i) && i >= 0 && i < request.evidence.length)
            .map((i) => request.evidence[i]!.chunkId),
        ),
      ];

      if (!output.grounded || citedChunkIds.length === 0) {
        return { answer: NOT_ENOUGH_INFO, grounded: false, citedChunkIds: [] };
      }
      if (containsDefinitiveJudgment(output.answer)) {
        return fallback(request, "model answer contained a definitive legal judgment");
      }

      return { answer: `${output.answer.trim()} ${DISCLAIMER}`, grounded: true, citedChunkIds };
    },
  };
}
