import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyseDocx } from "../src/evaluation/analyseDocument.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { getActiveRetrievalProvider } from "../src/rag/retrievalProviderFactory.js";
import { askFromFacts } from "../src/rag/runAsk.js";

// Anomaly Benchmark v2 (fictional synthetic fixtures; tests/fixtures/anomaly_v2). The answer key
// is a separate file the system never reads. These are regression tests over the benchmark: they
// say the pipeline still finds each planted problem with the right evidence, stays quiet on the
// clean controls, and answers the benchmark questions. They are NOT evidence of accuracy on real
// agreements. The held-out set was written after the main fixes; see docs/anomaly_benchmark_v2.md.
const here = path.dirname(fileURLToPath(import.meta.url));
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

interface KeyFinding {
  id: string;
  acceptedCategories: string[];
  requiredEvidence: string[];
}
interface KeyQuestion {
  id: string;
  type: string;
  question: string;
  expectStatus: string;
  expectContains?: string[];
  expectValues?: string[];
}
interface KeyDoc {
  docId: string;
  file: string;
  documentType: string;
  role: "flawed" | "clean";
  absentClauseTypes: string[];
  toleratedMissingClauseTypes?: string[];
  findings: KeyFinding[];
  questions: KeyQuestion[];
}

const isChecklist = (f: { category: string; ruleId?: string }) =>
  f.category === "MISSING_CLAUSE" && !String(f.ruleId ?? "").startsWith("missing_term");

for (const set of ["main", "heldout"] as const) {
  const dir = set === "main" ? "anomaly_v2" : "anomaly_v2/heldout";
  const fixtures = path.join(here, "fixtures", dir);
  const key = JSON.parse(readFileSync(path.join(fixtures, "ground_truth.json"), "utf8")) as {
    documents: KeyDoc[];
  };

  describe(`anomaly benchmark v2 (${set})`, () => {
    for (const doc of key.documents) {
      describe(`${doc.docId} ${doc.documentType} (${doc.role})`, () => {
        const analysis = analyseDocx(
          path.join(fixtures, "documents", doc.file),
          doc.docId,
          doc.documentType,
        );

        it("finds every planted finding with its evidence, and nothing else", async () => {
          const a = await analysis;
          const predicted = a.findings.filter((f) => !isChecklist(f));
          const used = new Set<number>();
          for (const expected of doc.findings) {
            const at = predicted.findIndex(
              (f, i) =>
                !used.has(i) &&
                expected.acceptedCategories.includes(f.category) &&
                expected.requiredEvidence.every((e) =>
                  norm(
                    f.evidence
                      .map((x) => x.text ?? a.text.slice(x.textStart ?? 0, x.textEnd ?? 0))
                      .join(" | "),
                  ).includes(norm(e)),
                ),
            );
            expect(at, `${expected.id} not found`).toBeGreaterThanOrEqual(0);
            used.add(at);
          }
          const unexpected = predicted.filter((_, i) => !used.has(i));
          expect(
            unexpected.map((f) => `${f.category}/${f.ruleId ?? ""}`),
            "unexpected findings",
          ).toEqual([]);
        });

        it("reports exactly the clauses that are really absent", async () => {
          const a = await analysis;
          const flagged = a.findings
            .filter(isChecklist)
            .map((f) => /^No (.+?) clause/.exec(f.reason)?.[1]?.toUpperCase().replace(/ /g, "_"))
            .filter(
              (t): t is string => !!t && !(doc.toleratedMissingClauseTypes ?? []).includes(t),
            );
          expect(flagged.sort()).toEqual([...doc.absentClauseTypes].sort());
        });

        it("cites evidence that is really in the document", async () => {
          const a = await analysis;
          for (const f of a.findings) {
            for (const e of f.evidence) {
              if (e.textStart == null || e.textEnd == null || !e.text) continue;
              const slice = a.text.slice(e.textStart, e.textEnd);
              // an entity's text is its span; a clause's text starts at its span
              expect(
                norm(slice).startsWith(norm(e.text).slice(0, 40)) || norm(slice) === norm(e.text),
              ).toBe(true);
            }
          }
        });

        it("answers the benchmark questions", async () => {
          const a = await analysis;
          for (const q of doc.questions) {
            const res = await askFromFacts({
              documentId: doc.docId,
              documentType: a.documentType,
              question: q.question,
              clauses: a.clauses,
              entities: a.entities,
              pages: a.pages,
              findings: a.findings.filter((f) => f.pass === "CONSISTENCY"),
              retrievalProvider: getActiveRetrievalProvider(),
              llmProvider: ExtractiveLLMProvider,
            });
            const answer = norm(res.answer);
            expect(res.evidenceStatus, `${q.id} status`).toBe(q.expectStatus);
            for (const v of q.expectContains ?? [])
              expect(answer, `${q.id} ${v}`).toContain(norm(v));
            if (q.type === "conflict") {
              for (const v of q.expectValues ?? []) {
                expect(answer, `${q.id} ${v}`).toContain(norm(v));
                // each conflicting value has its own citation
                expect(
                  res.sources.some((s) => norm(s.excerpt).includes(norm(v))),
                  `${q.id} cites ${v}`,
                ).toBe(true);
              }
            }
          }
        });
      });
    }
  });
}
