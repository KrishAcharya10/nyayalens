// Scores the Phase 6 risk engine against the adversarial + matched-control
// set (research/data/adversarial/), reading Risk rows Postgres already has
// from the pipeline run that happened during bulk-upload-adversarial.mjs -
// no need to re-run the risk engine here.
//
// For every category reports:
//   - detection rate on the 15 adversarial (positive) documents, matched
//     against expected_flag (not just "flagged something" - for
//     missing_clause specifically requires the SAME clause type)
//   - false-positive rate on the 15 matched controls (same category,
//     matched conditions - per the Phase 6 build prompt's addendum)
//   - cross-category false positives: on positive documents for category
//     X, how often did an unrelated category Y also fire
//   - for categories 2 (asymmetric_obligation) and 4 (land_use_contradiction)
//     only, whether persisted evidence actually references the specific
//     compared clauses/entities in that document, not just any two spans
//
// Numbers are reported exactly as computed - no rounding up, no omitting a
// weak category. See docs/architecture/adversarial_evaluation_results.md
// for the write-up built from this script's output.
//
// Usage (from apps/api):
//   dotenv -e ../../.env -- tsx scripts/evaluate-adversarial.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";

const prisma = getPrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADVERSARIAL_DIR = path.resolve(__dirname, "../../../research/data/adversarial");

const CATEGORY_SLUG_TO_ENUM = {
  liability_shift: "LIABILITY_SHIFT",
  asymmetric_obligation: "ASYMMETRIC_OBLIGATION",
  unbounded_discretion: "UNBOUNDED_DISCRETION",
  land_use_contradiction: "LAND_USE_CONTRADICTION",
  missing_clause: "MISSING_CLAUSE",
};

function loadUploadManifest() {
  const lines = readFileSync(path.join(ADVERSARIAL_DIR, "upload_manifest.jsonl"), "utf-8")
    .trim()
    .split("\n");
  return lines.map((l) => JSON.parse(l));
}

function clauseNumberFromEvidenceText(text) {
  const m = /^(\d+)\./.exec(text ?? "");
  return m ? m[1] : null;
}

function isMissingClauseDetected(risks, expectedType) {
  const expectedSubstring = expectedType.replace(/_/g, " ").toLowerCase();
  return risks.some(
    (risk) =>
      risk.category === "MISSING_CLAUSE" && risk.reason.toLowerCase().includes(expectedSubstring),
  );
}

function asymmetricObligationEvidenceCorrect(risks, expectedClauseNumbers) {
  const finding = risks.find((r) => r.category === "ASYMMETRIC_OBLIGATION");
  if (!finding) return false;
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  if (evidence.length !== 2) return false;
  const gotClauseNumbers = evidence
    .map((e) => clauseNumberFromEvidenceText(e.text))
    .filter((n) => n !== null)
    .sort();
  const expected = [...expectedClauseNumbers].sort();
  return JSON.stringify(gotClauseNumbers) === JSON.stringify(expected);
}

function landUseContradictionEvidenceCorrect(risks, expectedPermittedUse) {
  const finding = risks.find((r) => r.category === "LAND_USE_CONTRADICTION");
  if (!finding) return false;
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  if (evidence.length !== 2) return false;
  const entityEv = evidence.find((e) => e.sourceTable === "entities");
  const clauseEv = evidence.find((e) => e.sourceTable === "document_clauses");
  if (!entityEv || !clauseEv) return false;
  const entityOk =
    /agricultural/i.test(entityEv.text ?? "") && !/non-agricultural/i.test(entityEv.text ?? "");
  const clauseOk = (clauseEv.text ?? "").toLowerCase().includes(expectedPermittedUse.toLowerCase());
  return entityOk && clauseOk;
}

async function main() {
  const manifest = loadUploadManifest();

  const withRisks = [];
  for (const entry of manifest) {
    const risks = await prisma.risk.findMany({ where: { documentId: entry.document_id } });
    withRisks.push({ ...entry, risks });
  }

  const perCategory = {};

  for (const [slug, enumCat] of Object.entries(CATEGORY_SLUG_TO_ENUM)) {
    const positives = withRisks.filter((r) => r.category === slug && !r.is_control);
    const controls = withRisks.filter((r) => r.category === slug && r.is_control);

    let detected;
    if (slug === "missing_clause") {
      detected = positives.filter((r) =>
        isMissingClauseDetected(r.risks, r.expected_flag.detail.missing_clause_type),
      );
    } else {
      detected = positives.filter((r) => r.risks.some((risk) => risk.category === enumCat));
    }

    const controlFalsePositives = controls.filter((r) =>
      r.risks.some((risk) => risk.category === enumCat),
    );

    const crossCategoryFalsePositives = {};
    for (const otherCat of Object.values(CATEGORY_SLUG_TO_ENUM)) {
      if (otherCat === enumCat) continue;
      crossCategoryFalsePositives[otherCat] = positives.filter((r) =>
        r.risks.some((risk) => risk.category === otherCat),
      ).length;
    }

    const entry = {
      category: enumCat,
      n_positive: positives.length,
      n_detected: detected.length,
      detection_rate: positives.length > 0 ? detected.length / positives.length : null,
      n_control: controls.length,
      n_control_false_positive: controlFalsePositives.length,
      control_false_positive_rate:
        controls.length > 0 ? controlFalsePositives.length / controls.length : null,
      cross_category_false_positives_on_positive_docs: crossCategoryFalsePositives,
    };

    if (slug === "asymmetric_obligation") {
      const evidenceCorrect = detected.filter((r) =>
        asymmetricObligationEvidenceCorrect(r.risks, r.expected_flag.detail.clause_numbers),
      );
      entry.evidence_checked = detected.length;
      entry.evidence_correct = evidenceCorrect.length;
      entry.evidence_correctness_rate =
        detected.length > 0 ? evidenceCorrect.length / detected.length : null;
    } else if (slug === "land_use_contradiction") {
      const evidenceCorrect = detected.filter((r) =>
        landUseContradictionEvidenceCorrect(r.risks, r.expected_flag.detail.permitted_use),
      );
      entry.evidence_checked = detected.length;
      entry.evidence_correct = evidenceCorrect.length;
      entry.evidence_correctness_rate =
        detected.length > 0 ? evidenceCorrect.length / detected.length : null;
    }

    perCategory[slug] = entry;
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_documents: withRisks.length,
    per_category: perCategory,
  };

  writeFileSync(
    path.join(ADVERSARIAL_DIR, "evaluation_results.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[evaluate-adversarial] Fatal error:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
