import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Section 1/17/23's mandatory limitation copy must be sourced from the
// ACTUAL current evaluation results, not hardcoded static strings that
// could go stale - this is a Next.js-internal route handler (not part of
// the Express API, so it doesn't touch anything in Section 31's list),
// reading the same result files docs/architecture/*.md are themselves
// built from. If a file is missing (evaluation never run in this
// environment), the corresponding stat is simply omitted - never a
// fabricated placeholder number.
const MONOREPO_ROOT = path.resolve(process.cwd(), "..", "..");

interface AdversarialCategoryStats {
  category: string;
  detection_rate: number | null;
  control_false_positive_rate: number | null;
}

async function readJson<T>(relativePath: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(MONOREPO_ROOT, relativePath), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [quality, security, adversarial, ordinaryFp] = await Promise.all([
    readJson<{
      retrieval_hit_rate_at_k: { any_expected: number; all_expected: number };
      grounded_answer_rate: number;
      citation_correctness_rate: number | null;
      refusal_correctness_rate: number;
    }>("apps/api/rag_eval/quality_results.json"),
    readJson<{ n_cases: number; n_passed: number }>("apps/api/rag_eval/security_results.json"),
    readJson<{
      total_documents: number;
      per_category: Record<string, AdversarialCategoryStats>;
    }>("research/data/adversarial/evaluation_results.json"),
    readJson<{ n_documents: number; overall_false_positive_rate: number }>(
      "research/data/adversarial/ordinary_control_fp_results.json",
    ),
  ]);

  const adversarialCategories = adversarial
    ? Object.values(adversarial.per_category).map((c) => ({
        category: c.category,
        detectionRate: c.detection_rate,
        controlFalsePositiveRate: c.control_false_positive_rate,
      }))
    : null;

  return NextResponse.json({
    rag: quality
      ? {
          retrievalHitRateAny: quality.retrieval_hit_rate_at_k.any_expected,
          retrievalHitRateAll: quality.retrieval_hit_rate_at_k.all_expected,
          groundedAnswerRate: quality.grounded_answer_rate,
          citationCorrectnessRate: quality.citation_correctness_rate,
          refusalCorrectnessRate: quality.refusal_correctness_rate,
        }
      : null,
    ragSecurity: security ? { nCases: security.n_cases, nPassed: security.n_passed } : null,
    adversarial: adversarial
      ? { totalDocuments: adversarial.total_documents, categories: adversarialCategories }
      : null,
    ordinaryControlFalsePositiveRate: ordinaryFp ? ordinaryFp.overall_false_positive_rate : null,
  });
}
