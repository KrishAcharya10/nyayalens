import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHETIC_DIR = path.resolve(__dirname, "../../../research/data/synthetic");

interface GroundTruthEntity {
  start: number;
  end: number;
  label: string;
  text: string;
}

interface LabelsFile {
  doc_id: string;
  text: string;
  entities: GroundTruthEntity[];
}

function loadLabels(docId: string): LabelsFile {
  return JSON.parse(
    readFileSync(path.join(SYNTHETIC_DIR, `${docId}.labels.json`), "utf-8"),
  ) as LabelsFile;
}

// This is a PIPELINE CORRECTNESS SANITY CHECK against synthetic ground
// truth (see Phase 4A build prompt Section 10 / docs/architecture/
// extraction_pipeline.md) - it proves the extractor runs and finds a
// reasonable share of entities on real generated text, NOT a formal
// evaluation. Formal precision/recall/F1 across folds belongs to Phase 4B
// (docs/architecture/evaluation_results.md).
describe("rule-based NER vs synthetic ground truth (sanity check, not an evaluation)", () => {
  it("recovers most DURATION/RENT/SECURITY_DEPOSIT/SURVEY_NUMBER/LAND_AREA entities on a residential rental sample", () => {
    const labels = loadLabels("residential_rental_173700710b");
    const predicted = runRuleBasedNer(labels.text);

    const recoverable = labels.entities.filter((e) =>
      ["DURATION", "RENT", "SECURITY_DEPOSIT", "SURVEY_NUMBER", "LAND_AREA"].includes(e.label),
    );
    const hits = recoverable.filter((gt) =>
      predicted.some(
        (p) => p.label === gt.label && p.textStart === gt.start && p.textEnd === gt.end,
      ),
    );

    expect(recoverable.length).toBeGreaterThan(0);
    expect(hits.length / recoverable.length).toBeGreaterThanOrEqual(0.8);
  });

  it("finds SURVEY_NUMBER, LAND_AREA, and LAND_USE_TYPE on a sample of land lease documents", () => {
    const manifestPath = path.join(SYNTHETIC_DIR, "manifest.jsonl");
    const manifestLines = readFileSync(manifestPath, "utf-8").trim().split("\n");
    const landLeaseDocIds = manifestLines
      .map((line) => JSON.parse(line) as { doc_id: string; document_type: string })
      .filter((entry) => entry.document_type === "land_lease")
      .slice(0, 10)
      .map((entry) => entry.doc_id);

    expect(landLeaseDocIds.length).toBe(10);

    let totalTargetEntities = 0;
    let totalHits = 0;

    for (const docId of landLeaseDocIds) {
      const labels = loadLabels(docId);
      const predicted = runRuleBasedNer(labels.text);
      const targets = labels.entities.filter((e) =>
        ["SURVEY_NUMBER", "LAND_AREA", "LAND_USE_TYPE"].includes(e.label),
      );
      totalTargetEntities += targets.length;
      totalHits += targets.filter((gt) =>
        predicted.some(
          (p) => p.label === gt.label && p.textStart === gt.start && p.textEnd === gt.end,
        ),
      ).length;
    }

    expect(totalTargetEntities).toBeGreaterThan(0);
    expect(totalHits / totalTargetEntities).toBeGreaterThanOrEqual(0.7);
  });

  it("never fabricates a currency-amount label without supporting context", () => {
    const text = "The total value mentioned herein is ₹50,000 for reference purposes only.";
    const predicted = runRuleBasedNer(text);
    expect(predicted.find((p) => p.text === "₹50,000")).toBeUndefined();
  });
});
