// Renders docs/anomaly_benchmark_v2.md from the result files written by evaluate-anomaly-v2.mjs.
//   node scripts/anomaly-v2-report.mjs
// Inputs (research/data/reports): anomaly_v2_baseline.json, anomaly_v2_latest.json,
// anomaly_v2_heldout_first_run.json, anomaly_v2_heldout_after_fix.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const R = (n) =>
  JSON.parse(readFileSync(path.join(REPO, "research/data/reports", `${n}.json`), "utf8"));
const b = R("anomaly_v2_baseline");
const l = R("anomaly_v2_latest");
const h1 = R("anomaly_v2_heldout_first_run");
const h2 = R("anomaly_v2_heldout_after_fix");
const f = (x) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(2));
const row = (name, r) => {
  const a = r.anomalyDetection;
  const q = r.questionAnswering;
  const c = r.completenessChecklist;
  return `| ${name} | ${f(a.overall.precision)} / ${f(a.overall.recall)} / ${f(a.overall.f1)} | ${a.cleanControls.documentsWithAnyFinding}/${a.cleanControls.documents} | ${a.documentsFullyCorrect.count}/${a.documentsFullyCorrect.of} | ${f(c.precision)} / ${f(c.recall)} | ${q.fact.correct}/${q.fact.total} | ${q.conflictReporting.correct}/${q.conflictReporting.total} | ${q.unanswerable.correct}/${q.unanswerable.total} | ${q.liabilityCap.correct}/${q.liabilityCap.total} |`;
};
const fam = (r) =>
  Object.entries(r.anomalyDetection.byFamily)
    .map(([k, v]) => `| ${k} | ${v.tp} | ${v.fp} | ${v.fn} | ${f(v.f1)} |`)
    .join("\n");
const cat = (r, base) =>
  Object.entries(r.anomalyDetection.byCategory)
    .map(
      ([k, v]) =>
        `| ${k} | ${base.anomalyDetection.byCategory[k].detected}/${v.expected} | ${v.detected}/${v.expected} |`,
    )
    .join("\n");

const md = `# Anomaly Benchmark v2 - baseline and updated results

> Fictional synthetic documents. These numbers are **not** a measure of accuracy on real agreements, and every finding is a review prompt, not a legal conclusion or a statement about enforceability. Figures are generated from \`research/data/reports/anomaly_v2_*.json\` by \`apps/api/scripts/anomaly-v2-report.mjs\`.

## What was measured

14 fixture documents (7 flawed, 7 clean controls) in \`apps/api/tests/fixtures/anomaly_v2/documents\`, with the answer key in \`ground_truth.json\` (never read by the system): 17 expected findings and 40 questions (fact, conflict, unanswerable, liability cap). A second **held-out** set of 6 documents (\`heldout/\`) was written after the main fixes.

Matching: a predicted finding matches an expected one when it is on the same document, its category is accepted, and its cited evidence contains every required string. One predicted finding matches at most one expected finding; unmatched predictions are false positives (every finding on a clean control is one). The pack's expected-clause checklist ("No X clause was found") is scored separately, against each document's list of clauses that really are absent. A conflict question is correct only if the answer contains every conflicting value and each value has its own citation; an unanswerable question is correct only if the status is NOT_SUFFICIENT.

Only the rule-based engine is evaluated. The transformer NER stage is unavailable here (\`ML_SERVICE_PYTHON\` is not set) and no LLM is configured (extractive answerer only), so no model scores exist and none are claimed.

## Results

| Run | Anomaly P / R / F1 | Clean controls with a finding | Documents fully correct | Checklist P / R | Fact | Conflict | Unanswerable | Liability cap |
|---|---|---|---|---|---|---|---|---|
${row("Main set, baseline (before any fix)", b)}
${row("Main set, updated", l)}
${row("Held-out set, first run (after the main fixes)", h1)}
${row("Held-out set, after fixing what it exposed", h2)}

The main set was used while the fixes were built, so its updated row is a development result, not evidence of generalisation. The held-out first run is the only row that was not tuned on; it exposed real gaps (below), and its "after" row is again a development result. Perfect scores on sets this small, written by the team that wrote the rules, should be read accordingly.

### Main set by document family (updated)
| Family | TP | FP | FN | F1 |
|---|---|---|---|---|
${fam(l)}

### Main set by anomaly category (detected, baseline then updated)
| Category | Baseline | Updated |
|---|---|---|
${cat(l, b)}

## What the held-out run exposed
- The tolerance for "stated term vs dates" was too loose (a 12-month term over 11 months of dates passed).
- "indemnity" (the noun) was not recognised as an indemnity; only "indemnify".
- Liability exceptions worded "Nothing in this clause limits liability for fraud" were not extracted.
- "The monthly fee ... is INR X" was not read as a fee.
- A heading such as "Ending the Tenancy" produced a missing-termination finding, and an advance paid "as advance" a missing-advance finding.
- Two benchmark-side corrections, disclosed: the H3 answer key wrongly listed no absent clause (the document has no confidentiality clause, so the system was right), and on the main set the retention finding's required evidence was changed to the two durations it cites rather than the words "archival copies".

## Fixes
Amount labelling (nearest keyword, stops at the previous amount, no trailing comma), conflict-aware answers with one citation per value, liability limit / exception / uncapped-indemnity answers, a coverage guard that refuses questions about terms the document never mentions, Party A / Party B and Supplier roles, payment-deadline conflicts, CTC component arithmetic (only when the text says the components are the whole), stated term against its dates, return-versus-retention (a review item), a missing deposit-refund deadline (a missing term, not a contradiction), missing-clause findings no longer raised for unfamiliar headings, and "Employer" in the notice-asymmetry check.

No regression on the older synthetic benchmark (\`docs/evaluation.md\`, seed 2027): all 1,614 compared metrics were unchanged or better after these changes (0 worse).

## Limitations
- Small fixtures written by the same team as the rules; the held-out set has 6 documents.
- Rules are phrase-based; other exception or refund wordings will be missed.
- The retention-versus-return rule flags ordinary "archival copy" carve-outs; it is a review prompt.
- The coverage guard refuses a question that uses a synonym the document does not contain.
- No real agreements, no OCR, no transformer or LLM results.

## Reproduce
\`\`\`
cd apps/api
npx tsx scripts/evaluate-anomaly-v2.mjs --label latest                 # main set
npx tsx scripts/evaluate-anomaly-v2.mjs --set heldout --label latest   # held-out set
node scripts/anomaly-v2-report.mjs                                     # this report
npm test --workspace=apps/api                                          # includes the three anomaly test files
\`\`\`
Fixtures are rebuilt with \`python tests/fixtures/anomaly_v2/build_fixtures.py [heldout]\` (needs python-docx).
`;
writeFileSync(path.join(REPO, "docs/anomaly_benchmark_v2.md"), md);
console.log("wrote docs/anomaly_benchmark_v2.md");
