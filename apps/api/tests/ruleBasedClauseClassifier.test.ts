import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runRuleBasedClauseClassification } from "../src/clauses/ruleBasedClauseClassifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHETIC_DIR = path.resolve(__dirname, "../../../research/data/synthetic");

interface GroundTruthClause {
  start: number;
  end: number;
  label: string;
  clause_number: string;
}

interface LabelsFile {
  doc_id: string;
  document_type: string;
  text: string;
  clauses: GroundTruthClause[];
}

function loadLabels(docId: string): LabelsFile {
  return JSON.parse(
    readFileSync(path.join(SYNTHETIC_DIR, `${docId}.labels.json`), "utf-8"),
  ) as LabelsFile;
}

// Pipeline correctness sanity check against synthetic ground truth, not a
// formal evaluation - see ruleBasedNer.test.ts's header for why, and
// docs/architecture/evaluation_results.md for the real Phase 4B numbers.
describe("rule-based clause classification vs synthetic ground truth (sanity check)", () => {
  // Not 100%: the heuristic segmenter has one structural, expected gap -
  // the LAST clause's span always extends to the end of the extracted
  // text (there is no next heading to bound it against), so it swallows
  // trailing signature boilerplate ("IN WITNESS WHEREOF...") the ground
  // truth's clause span doesn't include. This consistently costs one
  // clause (JURISDICTION, always last) per document and is documented in
  // docs/architecture/extraction_pipeline.md rather than special-cased
  // away - trimming specifically for "IN WITNESS WHEREOF" would be
  // overfitting the baseline to this dataset's exact boilerplate phrase.
  it("finds every clause on a sample of 10 residential rental documents with exact spans", () => {
    const manifestPath = path.join(SYNTHETIC_DIR, "manifest.jsonl");
    const manifestLines = readFileSync(manifestPath, "utf-8").trim().split("\n");
    const docIds = manifestLines
      .map((line) => JSON.parse(line) as { doc_id: string; document_type: string })
      .filter((entry) => entry.document_type === "residential_rental")
      .slice(0, 10)
      .map((entry) => entry.doc_id);

    let totalGroundTruthClauses = 0;
    let totalHits = 0;

    for (const docId of docIds) {
      const labels = loadLabels(docId);
      const predicted = runRuleBasedClauseClassification(labels.text);
      totalGroundTruthClauses += labels.clauses.length;
      totalHits += labels.clauses.filter((gt) =>
        predicted.some(
          (p) => p.clauseType === gt.label && p.textStart === gt.start && p.textEnd === gt.end,
        ),
      ).length;
    }

    expect(totalGroundTruthClauses).toBeGreaterThan(0);
    expect(totalHits / totalGroundTruthClauses).toBeGreaterThanOrEqual(0.85);
  });

  it("finds LEASE_PREMIUM, ENCUMBRANCE_DECLARATION, and LAND_USE_RESTRICTION on land lease documents", () => {
    const manifestPath = path.join(SYNTHETIC_DIR, "manifest.jsonl");
    const manifestLines = readFileSync(manifestPath, "utf-8").trim().split("\n");
    const docIds = manifestLines
      .map((line) => JSON.parse(line) as { doc_id: string; document_type: string })
      .filter((entry) => entry.document_type === "land_lease")
      .slice(0, 10)
      .map((entry) => entry.doc_id);

    const wantedTypes = ["LEASE_PREMIUM", "ENCUMBRANCE_DECLARATION", "LAND_USE_RESTRICTION"];
    let totalTargets = 0;
    let totalHits = 0;

    for (const docId of docIds) {
      const labels = loadLabels(docId);
      const predicted = runRuleBasedClauseClassification(labels.text);
      const targets = labels.clauses.filter((c) => wantedTypes.includes(c.label));
      totalTargets += targets.length;
      totalHits += targets.filter((gt) =>
        predicted.some(
          (p) => p.clauseType === gt.label && p.textStart === gt.start && p.textEnd === gt.end,
        ),
      ).length;
    }

    expect(totalTargets).toBeGreaterThan(0);
    expect(totalHits / totalTargets).toBeGreaterThanOrEqual(0.9);
  });
});
