// Anomaly Benchmark v2 - runs the real analysis and question-answering code
// (the same functions the upload pipeline and /ask call) over the fixture
// documents and scores the output against the separate answer key.
//
//   cd apps/api && npx tsx scripts/evaluate-anomaly-v2.mjs --label latest
//
// Needs no database and no network. Writes research/data/reports/anomaly_v2_<label>.json.
// The documents are fictional and synthetic: these numbers are NOT a measure of
// accuracy on real agreements, and every finding is a review prompt, not a legal conclusion.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyseDocx } from "../src/evaluation/analyseDocument.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { getActiveRetrievalProvider } from "../src/rag/retrievalProviderFactory.js";
import { askFromFacts } from "../src/rag/runAsk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const setAt = process.argv.indexOf("--set");
const SET = setAt > 0 ? process.argv[setAt + 1] : "main";
const FIX =
  SET === "heldout"
    ? path.join(__dirname, "../tests/fixtures/anomaly_v2/heldout")
    : path.join(__dirname, "../tests/fixtures/anomaly_v2");
const labelAt = process.argv.indexOf("--label");
const LABEL = labelAt > 0 ? process.argv[labelAt + 1] : "latest";
const OUT = path.join(
  REPO,
  "research/data/reports",
  `anomaly_v2${SET === "heldout" ? "_heldout" : ""}_${LABEL}.json`,
);

const key = JSON.parse(readFileSync(path.join(FIX, "ground_truth.json"), "utf8"));
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const ratio = (a, b) => (b ? +(a / b).toFixed(4) : null);
const prf = (tp, fp, fn) => {
  const p = tp + fp ? tp / (tp + fp) : null;
  const r = tp + fn ? tp / (tp + fn) : null;
  const f =
    p !== null && r !== null && p + r > 0
      ? (2 * p * r) / (p + r)
      : p === null || r === null
        ? null
        : 0;
  return {
    tp,
    fp,
    fn,
    precision: p === null ? null : +p.toFixed(4),
    recall: r === null ? null : +r.toFixed(4),
    f1: f === null ? null : +f.toFixed(4),
  };
};

const analyse = (doc) =>
  analyseDocx(path.join(FIX, "documents", doc.file), doc.docId, doc.documentType);

// Evidence text of a finding: the cited entity/clause text, or the text sliced from the span.
const evidenceText = (f, text) =>
  norm(
    f.evidence
      .map(
        (e) =>
          e.text ??
          (e.textStart != null && e.textEnd != null ? text.slice(e.textStart, e.textEnd) : ""),
      )
      .join(" | "),
  );

// A completeness-checklist finding: "no X clause was found" from the pack's expected-clause list.
const isChecklist = (f) =>
  f.category === "MISSING_CLAUSE" && !String(f.ruleId ?? "").startsWith("missing_term");
const missingType = (f) => {
  const m = /^No (.+?) clause was (?:found|identified)/.exec(f.reason ?? "");
  return m ? m[1].toUpperCase().replace(/ /g, "_") : null;
};

function matchFindings(doc, sys) {
  const expected = doc.findings.map((x) => ({ ...x, matched: null }));
  const predicted = sys.findings
    .filter((f) => !isChecklist(f))
    .map((f, i) => ({ i, f, text: evidenceText(f, sys.text), used: false }));
  // Pass 1: every required anchor present; pass 2: at least one anchor (partial evidence).
  for (const mode of ["all", "any"]) {
    for (const e of expected) {
      if (e.matched) continue;
      const hit = predicted.find(
        (p) =>
          !p.used &&
          e.acceptedCategories.includes(p.f.category) &&
          (mode === "all"
            ? e.requiredEvidence.every((a) => p.text.includes(norm(a)))
            : e.requiredEvidence.some((a) => p.text.includes(norm(a)))),
      );
      if (hit) {
        hit.used = true;
        e.matched = {
          category: hit.f.category,
          severity: hit.f.severity,
          ruleId: hit.f.ruleId ?? null,
          evidenceComplete: mode === "all",
          reason: hit.f.reason,
        };
      }
    }
  }
  return { expected, unmatched: predicted.filter((p) => !p.used) };
}

const results = {
  benchmark: "anomaly-v2",
  label: LABEL,
  generatedAt: new Date().toISOString(),
  scope:
    "Fictional synthetic documents. Not a measure of real-world legal accuracy; findings are review prompts, not legal conclusions.",
  models: {
    ruleEngine: "evaluated",
    transformerNer: process.env.ML_SERVICE_PYTHON
      ? "configured but not exercised by this harness"
      : "unavailable (ML_SERVICE_PYTHON not set); not evaluated",
    llm:
      process.env.LLM_PROVIDER === "ollama"
        ? "configured but not exercised by this harness"
        : "unavailable (extractive provider only); not evaluated",
  },
  documents: {},
};

const sysCache = {};
const totals = { tp: 0, fp: 0, fn: 0 };
const byCategory = {};
const byFamily = {};
const byKind = {};
const evid = { matched: 0, complete: 0, severityAgrees: 0 };
const checklist = { tp: 0, fp: 0, fn: 0, falseAlarms: [] };
let cleanDocs = 0,
  cleanWithFinding = 0,
  cleanFindings = 0,
  fullyCorrect = 0,
  docCount = 0;
const bump = (map, k, field) => (map[k] ??= { tp: 0, fp: 0, fn: 0 })[field]++;

for (const doc of key.documents) {
  const sys = (sysCache[doc.docId] = await analyse(doc));
  const { expected, unmatched } = matchFindings(doc, sys);
  docCount++;
  let docFn = 0;
  for (const e of expected) {
    if (e.matched) {
      totals.tp++;
      bump(byCategory, e.benchmarkCategory, "tp");
      bump(byFamily, doc.family, "tp");
      bump(byKind, e.kind, "tp");
      evid.matched++;
      if (e.matched.evidenceComplete) evid.complete++;
      if (e.matched.severity === e.severity) evid.severityAgrees++;
    } else {
      totals.fn++;
      docFn++;
      bump(byCategory, e.benchmarkCategory, "fn");
      bump(byFamily, doc.family, "fn");
      bump(byKind, e.kind, "fn");
    }
  }
  for (const p of unmatched) {
    totals.fp++;
    bump(byFamily, doc.family, "fp");
  }
  const anomalyFindings = sys.findings.filter((f) => !isChecklist(f));
  const flagged = sys.findings.filter(isChecklist).map(missingType);
  const absent = doc.absentClauseTypes ?? [];
  const tolerated = doc.toleratedMissingClauseTypes ?? [];
  for (const t of flagged) {
    if (absent.includes(t)) checklist.tp++;
    else if (!tolerated.includes(t)) {
      checklist.fp++;
      checklist.falseAlarms.push(`${doc.docId}:${t}`);
    }
  }
  for (const t of absent) if (!flagged.includes(t)) checklist.fn++;
  if (doc.role === "clean") {
    cleanDocs++;
    cleanFindings += anomalyFindings.length;
    if (anomalyFindings.length) cleanWithFinding++;
  }
  const checklistWrong =
    flagged.filter((t) => !absent.includes(t) && !tolerated.includes(t)).length +
    absent.filter((t) => !flagged.includes(t)).length;
  if (docFn === 0 && unmatched.length === 0 && checklistWrong === 0) fullyCorrect++;
  results.documents[doc.docId] = {
    file: doc.file,
    documentType: doc.documentType,
    role: doc.role,
    entities: sys.entities.length,
    clauses: sys.clauses.length,
    expected: expected.map((e) => ({
      id: e.id,
      category: e.benchmarkCategory,
      kind: e.kind,
      found: !!e.matched,
      evidenceComplete: e.matched?.evidenceComplete ?? null,
      matchedCategory: e.matched?.category ?? null,
      severity: e.matched?.severity ?? null,
      expectedSeverity: e.severity,
      ruleId: e.matched?.ruleId ?? null,
    })),
    checklistFlagged: flagged,
    unexpectedFindings: unmatched.map((p) => ({
      category: p.f.category,
      severity: p.f.severity,
      ruleId: p.f.ruleId ?? null,
      evidence: p.text.slice(0, 160),
      reason: (p.f.reason ?? "").slice(0, 140),
    })),
  };
}

results.completenessChecklist = {
  definition:
    "Pack expected-clause findings ('No X clause was found'), scored against each document's absentClauseTypes. Correct = the clause really is absent. A false alarm is a clause that is present but was not recognised.",
  ...prf(checklist.tp, checklist.fp, checklist.fn),
  falseAlarms: checklist.falseAlarms,
};
results.anomalyDetection = {
  definition:
    "TP: expected finding matched by a predicted finding (same document, accepted category, cited evidence contains the required strings; partial evidence still counts as detected but is scored separately). FP: any predicted finding that matches no expected finding, including every finding on a clean control. FN: expected finding with no match.",
  overall: prf(totals.tp, totals.fp, totals.fn),
  byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, prf(v.tp, v.fp, v.fn)])),
  byFamily: Object.fromEntries(
    Object.entries(byFamily).map(([k, v]) => [k, prf(v.tp, v.fp, v.fn)]),
  ),
  byCategory: Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [
      k,
      { detected: v.tp, expected: v.tp + v.fn, recall: ratio(v.tp, v.tp + v.fn) },
    ]),
  ),
  documentsFullyCorrect: {
    count: fullyCorrect,
    of: docCount,
    note: "all expected anomalies found, no unexpected anomaly, and the completeness checklist exactly right",
  },
  cleanControls: {
    documents: cleanDocs,
    documentsWithAnyFinding: cleanWithFinding,
    documentFalsePositiveRate: ratio(cleanWithFinding, cleanDocs),
    totalFalseFindings: cleanFindings,
  },
  evidence: {
    matchedFindings: evid.matched,
    completeEvidence: evid.complete,
    evidenceAccuracy: ratio(evid.complete, evid.matched),
    severityAgreement: ratio(evid.severityAgrees, evid.matched),
  },
};

// Question answering through the same code as /ask (structured facts first, then retrieval).
const retrieval = getActiveRetrievalProvider();
const qa = { byType: {}, details: [] };
const qaBump = (t, ok) => {
  const s = (qa.byType[t] ??= { total: 0, correct: 0 });
  s.total++;
  if (ok) s.correct++;
};
for (const doc of key.documents) {
  const sys = sysCache[doc.docId];
  for (const q of doc.questions) {
    const res = await askFromFacts({
      documentId: doc.docId,
      documentType: doc.documentType.toUpperCase(),
      question: q.question,
      clauses: sys.clauses,
      entities: sys.entities,
      pages: sys.pages,
      findings: sys.findings.filter((f) => f.pass === "CONSISTENCY"),
      retrievalProvider: retrieval,
      llmProvider: ExtractiveLLMProvider,
    });
    const answer = norm(res.answer);
    const statusOk = res.evidenceStatus === q.expectStatus;
    let ok = statusOk;
    let note = "";
    if (q.type === "conflict") {
      const values = q.expectValues.map(norm);
      const all = values.every((v) => answer.includes(v));
      const cited = values.every((v) => res.sources.some((s) => norm(s.excerpt).includes(v)));
      ok = statusOk && all && cited;
      note = `values in answer: ${all}; each value separately cited: ${cited}`;
    } else if (q.expectContains) {
      ok = statusOk && q.expectContains.every((v) => answer.includes(norm(v)));
    }
    qaBump(q.type, ok);
    qa.details.push({
      id: q.id,
      type: q.type,
      capState: q.capState ?? null,
      question: q.question,
      correct: ok,
      status: res.evidenceStatus,
      method: res.method,
      answer: res.answer.slice(0, 220),
      sources: res.sources.length,
      note,
    });
  }
}
const typeStat = (t) => ({
  ...(qa.byType[t] ?? { total: 0, correct: 0 }),
  accuracy: ratio(qa.byType[t]?.correct ?? 0, qa.byType[t]?.total ?? 0),
});
const capByState = {};
for (const d of qa.details.filter((x) => x.type === "cap")) {
  const s = (capByState[d.capState] ??= { total: 0, correct: 0 });
  s.total++;
  if (d.correct) s.correct++;
}
results.questionAnswering = {
  definition:
    "fact: status GROUNDED and the answer contains the expected value. conflict: the answer must contain every conflicting value AND each value must be cited by a source. unanswerable: status NOT_SUFFICIENT. cap: status and the expected terms. Answers come from askFromFacts (structured facts first, then BM25 retrieval with the extractive answerer).",
  fact: typeStat("fact"),
  conflictReporting: typeStat("conflict"),
  unanswerable: typeStat("unanswerable"),
  liabilityCap: { ...typeStat("cap"), byState: capByState },
  details: qa.details,
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(results, null, 2));
const a = results.anomalyDetection;
console.log(`label=${LABEL}  ->  ${path.relative(REPO, OUT)}`);
console.log(
  `anomalies  P=${a.overall.precision} R=${a.overall.recall} F1=${a.overall.f1}  (TP ${a.overall.tp} / FP ${a.overall.fp} / FN ${a.overall.fn})`,
);
console.log(
  `clean controls with any finding: ${a.cleanControls.documentsWithAnyFinding}/${a.cleanControls.documents}; documents fully correct: ${a.documentsFullyCorrect.count}/${a.documentsFullyCorrect.of}`,
);
console.log(
  `completeness checklist  P=${results.completenessChecklist.precision} R=${results.completenessChecklist.recall}  (TP ${results.completenessChecklist.tp} / FP ${results.completenessChecklist.fp} / FN ${results.completenessChecklist.fn})`,
);
console.log(`evidence accuracy (all anchors): ${a.evidence.evidenceAccuracy}`);
const q = results.questionAnswering;
console.log(
  `QA fact ${q.fact.correct}/${q.fact.total}  conflict ${q.conflictReporting.correct}/${q.conflictReporting.total}  unanswerable ${q.unanswerable.correct}/${q.unanswerable.total}  cap ${q.liabilityCap.correct}/${q.liabilityCap.total}`,
);
