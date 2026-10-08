"use client";

import { useState, type FormEvent } from "react";
import { askDocument } from "@/lib/api";
import type { AskResult } from "@/lib/apiTypes";
import { Button } from "@/components/ui/Button";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { Spinner } from "@/components/ui/States";
import { EvidenceStatusIndicator } from "./EvidenceStatusIndicator";
import { RefusalState } from "./RefusalState";
import { AskSourcesList } from "./AskSourcesList";
import { useEvaluationStats, formatPercent } from "@/lib/useEvaluationStats";

const DEFAULT_EXAMPLE_QUESTIONS = [
  "What is the monthly rent?",
  "Who is the landlord?",
  "What is the notice period?",
  "Who is responsible for maintenance?",
];

interface Exchange {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  result?: AskResult;
  error?: string;
}

// Section 19: a document-research tool, not a general chat clone -
// visibly scoped to this one document, with mandatory evidence framing
// on every single answer (Section 20).
//
// Phase 8: example questions come from the document's own domain (the
// IntelligencePanel derives them from the DomainPack overview fields), so a
// sale deed suggests "Who is the buyer?" rather than rent questions.
export function AskPanel({
  documentId,
  exampleQuestions = DEFAULT_EXAMPLE_QUESTIONS,
}: {
  documentId: string;
  exampleQuestions?: string[];
}) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const stats = useEvaluationStats();

  async function submitQuestion(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const id = Date.now();
    setExchanges((prev) => [{ id, question: trimmed, status: "loading" }, ...prev]);
    setQuestion("");
    try {
      const result = await askDocument(documentId, trimmed);
      setExchanges((prev) =>
        prev.map((ex) => (ex.id === id ? { ...ex, status: "done", result } : ex)),
      );
    } catch (err) {
      setExchanges((prev) =>
        prev.map((ex) =>
          ex.id === id
            ? {
                ...ex,
                status: "error",
                error: err instanceof Error ? err.message : "Could not get an answer",
              }
            : ex,
        ),
      );
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitQuestion(question);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-100 p-3">
        <h2 className="text-section-title text-ink-700">Ask this document</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Answers are based on evidence found in this document.
        </p>

        <form onSubmit={handleSubmit} className="mt-2.5 flex gap-1.5">
          <label htmlFor="ask-input" className="sr-only">
            Ask a question about this document
          </label>
          <input
            id="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 rounded border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-sm text-ink-800 focus-visible:border-saffron-500"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!question.trim()}>
            Ask
          </Button>
        </form>

        {exchanges.length === 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {exampleQuestions.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void submitQuestion(example)}
                className="rounded-full border border-ink-200 bg-paper-50 px-2.5 py-1 text-xs text-ink-500 hover:bg-paper-200"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {/* Section 23: permanent, compact, corresponds to the actual
            measured limitation (citation correctness), not generic "AI
            may make mistakes" copy. */}
        <div className="mt-2.5">
          <PermanentNotice tone="info">
            Evidence retrieved from this document is a source for review, not a guarantee that the
            retrieved passage fully answers the question.
            {stats?.rag?.citationCorrectnessRate != null && (
              <>
                {" "}
                In evaluation, cited evidence fully supported the answer in{" "}
                {formatPercent(stats.rag.citationCorrectnessRate)} of grounded test answers.
              </>
            )}
          </PermanentNotice>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {exchanges.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-ink-400">
            Ask a question above, or choose an example to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {exchanges.map((ex) => (
              <li key={ex.id} className="animate-fade-in">
                <p className="text-sm font-medium text-ink-700">{ex.question}</p>
                <div className="mt-1.5">
                  {ex.status === "loading" && (
                    <div role="status" className="flex items-center gap-2 text-xs text-ink-400">
                      <Spinner />
                      Searching this document...
                    </div>
                  )}
                  {ex.status === "error" && (
                    <p role="alert" className="text-xs text-risk-text">
                      {ex.error}
                    </p>
                  )}
                  {ex.status === "done" && ex.result && <AnswerCard result={ex.result} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AnswerCard({ result }: { result: AskResult }) {
  if (!result.grounded) {
    return (
      <>
        <RefusalState detail={result.method === "structured" ? result.answer : undefined} />
        <AskSourcesList sources={result.sources} />
      </>
    );
  }
  return (
    <div className="rounded border border-ink-100 bg-paper-50 p-2.5">
      <p className="text-sm leading-relaxed text-ink-800">{result.answer}</p>
      {/* Mandatory on every single grounded answer - see EvidenceStatusIndicator.tsx. */}
      <EvidenceStatusIndicator method={result.method} />
      <AskSourcesList sources={result.sources} />
    </div>
  );
}
