// Phase 8 evaluation harness over synthetic dataset v3 (+ the v1
// adversarial set as a regression check). Runs the SAME code the pipeline
// runs - runRuleBasedNer, runRuleBasedClauseClassification, analyzeText,
// detectDomain, answerStructured - over each document's raw text, and
// scores every layer against the generator's ground truth.
//
// Writes research/eval_results/v3_evaluation.json (git-ignored) and
// docs/evaluation.md (committed). Numbers are synthetic-only.
//
// Usage (from apps/api): npx tsx scripts/evaluate-v3.mjs [--data <dir>]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRuleBasedClauseClassification } from "../src/clauses/ruleBasedClauseClassifier.js";
import { taxonomyFromSchema } from "../src/clauses/clauseTaxonomy.js";
import { detectDomain } from "../src/domains/detectDomain.js";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";
import { buildChunks } from "../src/rag/chunking.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { getActiveRetrievalProvider } from "../src/rag/retrievalProviderFactory.js";
import { answerStructured } from "../src/rag/structuredQa.js";
import { analyzeText } from "../src/semantic/analyze.js";
import { normalizeByCoreType, valueKey } from "../src/semantic/normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const argData = process.argv.indexOf("--data");
const DATA =
  argData > 0
    ? path.resolve(process.argv[argData + 1])
    : path.join(REPO, "research/data/synthetic_v3");
const registry = getDomainPackRegistry();
const DOMAINS = registry.list().map((p) => p.id);

// ---------------------------------------------------------------------------
const readLines = (f) =>
  readFileSync(f, "utf8").replace(/\r/g, "").trim().split("\n").filter(Boolean);
const manifest = readLines(path.join(DATA, "manifest.jsonl")).map((l) => JSON.parse(l));
const loadRecord = (m) => JSON.parse(readFileSync(path.join(DATA, m.files.json), "utf8"));
const prf = (tp, fp, fn) => {
  const p = tp + fp ? tp / (tp + fp) : 0;
  const r = tp + fn ? tp / (tp + fn) : 0;
  return {
    precision: +p.toFixed(4),
    recall: +r.toFixed(4),
    f1: +(p + r ? (2 * p * r) / (p + r) : 0).toFixed(4),
    tp,
    fp,
    fn,
  };
};
const counter = () => ({ tp: 0, fp: 0, fn: 0 });
const add = (map, key, field, n = 1) => {
  map[key] ??= counter();
  map[key][field] += n;
};
const pct = (a, b) => (b ? +(a / b).toFixed(4) : null);
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

function runSystem(rec) {
  const pack = registry.forDocumentType(rec.document_type);
  const text = rec.raw_text;
  const entities = runRuleBasedNer(text, {
    allowedLabels: new Set(pack.entitySchema.map((e) => e.label)),
    pack,
  }).map((e, i) => ({
    id: `e${i}`,
    label: e.label,
    text: e.text,
    textStart: e.textStart,
    textEnd: e.textEnd,
  }));
  const clauses = runRuleBasedClauseClassification(text, taxonomyFromSchema(pack.clauseSchema)).map(
    (c, i) => ({
      id: `c${i}`,
      clauseType: c.clauseType,
      clauseNumber: c.clauseNumber,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
    }),
  );
  const analysis = analyzeText({
    documentId: rec.doc_id,
    documentType: rec.document_type,
    pack,
    text,
    entities,
    clauses,
  });
  return { pack, text, entities, clauses, ...analysis };
}

// ---------------------------------------------------------------------------
const results = { dataset: path.relative(REPO, DATA), generatedAt: new Date().toISOString() };
const cache = new Map();
const system = (m) => {
  if (!cache.has(m.doc_id)) {
    const rec = loadRecord(m);
    cache.set(m.doc_id, { rec, sys: runSystem(rec) });
  }
  return cache.get(m.doc_id);
};
const bySplit = (...splits) => manifest.filter((m) => splits.includes(m.split));

// 1. Domain detection --------------------------------------------------------
{
  const out = {};
  for (const [name, docs] of [
    ["test (all domains)", bySplit("test")],
    ["cross_domain (generic titles)", bySplit("cross_domain")],
  ]) {
    let ok = 0,
      dtOk = 0;
    const confusion = {};
    for (const m of docs) {
      const { rec } = system(m);
      const det = detectDomain(rec.raw_text, registry.list());
      if (det.predictedDomain === rec.domain) ok++;
      if (det.predictedDocumentType === rec.document_type) dtOk++;
      confusion[rec.domain] ??= {};
      confusion[rec.domain][det.predictedDomain ?? "NONE"] =
        (confusion[rec.domain][det.predictedDomain ?? "NONE"] ?? 0) + 1;
    }
    out[name] = {
      documents: docs.length,
      domainAccuracy: pct(ok, docs.length),
      documentTypeAccuracy: pct(dtOk, docs.length),
      confusion,
    };
  }
  results.domainDetection = out;
}

// 2. NER, 3. clauses, 4. relations, 5. obligations, 6. normalization -----------
function scoreExtraction(docs) {
  const ner = {},
    nerDomain = {},
    clause = {},
    rel = {},
    relEndpoint = { correct: 0, total: 0 };
  const obl = {
    gt: 0,
    matched: 0,
    actor: 0,
    action: 0,
    both: 0,
    object: 0,
    temporalTotal: 0,
    temporal: 0,
    predicted: 0,
    predictedMatched: 0,
  };
  const norm = {};
  for (const m of docs) {
    const { rec, sys } = system(m);
    const d = rec.domain;
    // NER (label + exact span)
    const P = new Set(sys.entities.map((e) => `${e.label}|${e.textStart}|${e.textEnd}`));
    const G = new Set(rec.entities.map((e) => `${e.label}|${e.start}|${e.end}`));
    for (const g of G)
      (add(ner, `${d}:${g.split("|")[0]}`, P.has(g) ? "tp" : "fn"),
        add(nerDomain, d, P.has(g) ? "tp" : "fn"));
    for (const p of P)
      if (!G.has(p)) (add(ner, `${d}:${p.split("|")[0]}`, "fp"), add(nerDomain, d, "fp"));
    // Clauses (type + start offset)
    const PC = new Set(sys.clauses.map((c) => `${c.clauseType}|${c.textStart}`));
    const GC = new Set(rec.clauses.map((c) => `${c.label}|${c.start}`));
    for (const g of GC) add(clause, d, PC.has(g) ? "tp" : "fn");
    for (const p of PC) if (!GC.has(p)) add(clause, d, "fp");
    // Relations (type, subject role, object role, object value)
    const coreType = new Map(sys.pack.entitySchema.map((e) => [e.label, e.coreType]));
    const vk = (label, text) => valueKey(normalizeByCoreType(coreType.get(label) ?? "TEXT", text));
    const gtMention = new Map(rec.entities.map((x) => [x.id, x]));
    const GR = new Map();
    for (const r of rec.relations) {
      const subj = r.subject_mention ? gtMention.get(r.subject_mention) : null;
      for (const mid of r.object_mentions) {
        const o = gtMention.get(mid);
        GR.set(
          `${r.type}|${r.subject_label}|${r.object_label}|${vk(o.label, o.text)}`,
          subj?.text ?? null,
        );
      }
    }
    const predEnt = new Map(sys.entities.map((x) => [x.id, x]));
    const PR = new Map();
    for (const r of sys.relations) {
      const o = predEnt.get(r.objectEntityId);
      PR.set(
        `${r.relationType}|${r.subjectLabel}|${r.objectLabel}|${vk(o.label, o.text)}`,
        r.subjectEntityId ? (predEnt.get(r.subjectEntityId)?.text ?? null) : null,
      );
    }
    for (const [k, subjText] of GR) {
      add(rel, d, PR.has(k) ? "tp" : "fn");
      if (PR.has(k)) {
        relEndpoint.total++;
        if (PR.get(k) === subjText) relEndpoint.correct++;
      }
    }
    for (const k of PR.keys()) if (!GR.has(k)) add(rel, d, "fp");
    // Obligations (matched by evidence overlap >= 50% of the ground-truth span)
    const used = new Set();
    obl.predicted += sys.obligations.length;
    for (const g of rec.obligations) {
      obl.gt++;
      const gs = g.evidence.start,
        ge = g.evidence.end;
      let best = -1,
        bestOv = 0;
      sys.obligations.forEach((o, i) => {
        const ov = overlap(gs, ge, o.textStart, o.textEnd);
        if (ov > bestOv && !used.has(i)) {
          best = i;
          bestOv = ov;
        }
      });
      if (best < 0 || bestOv < 0.5 * (ge - gs)) continue;
      used.add(best);
      const o = sys.obligations[best];
      obl.matched++;
      if (o.actorLabel === g.actor_label) obl.actor++;
      if (o.action === g.action) obl.action++;
      if (o.actorLabel === g.actor_label && o.action === g.action) obl.both++;
      if ((o.amountLabel ?? null) === (g.amount_label ?? null)) obl.object++;
      if (g.deadline) {
        obl.temporalTotal++;
        if (o.deadlineIso === g.deadline.iso) obl.temporal++;
      }
    }
    obl.predictedMatched += used.size;
    // Normalization of ground-truth spans
    for (const e of rec.entities) {
      if (!["MONEY", "DATE", "DURATION", "PERCENT", "AREA"].includes(e.core_type)) continue;
      norm[e.core_type] ??= { total: 0, correct: 0 };
      norm[e.core_type].total++;
      const got = normalizeByCoreType(e.core_type, e.text);
      const want = e.normalized;
      const same =
        got &&
        want &&
        (e.core_type === "MONEY"
          ? got.amount === want.amount
          : e.core_type === "DATE"
            ? got.iso === want.iso
            : e.core_type === "DURATION"
              ? got.value === want.value && got.unit === want.unit
              : e.core_type === "PERCENT"
                ? got.value === want.value
                : got.value === want.value &&
                  got.unit.replace(/\s/g, "") === want.unit.replace(/\s/g, ""));
      if (same) norm[e.core_type].correct++;
    }
  }
  const perDomain = (map) =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, prf(v.tp, v.fp, v.fn)]));
  const micro = (map) => {
    const t = Object.values(map).reduce(
      (a, v) => ({ tp: a.tp + v.tp, fp: a.fp + v.fp, fn: a.fn + v.fn }),
      counter(),
    );
    return prf(t.tp, t.fp, t.fn);
  };
  return {
    documents: docs.length,
    ner: { micro: micro(nerDomain), perDomain: perDomain(nerDomain), perLabel: perDomain(ner) },
    clauses: { micro: micro(clause), perDomain: perDomain(clause) },
    relations: {
      micro: micro(rel),
      perDomain: perDomain(rel),
      subjectEndpointAccuracy: pct(relEndpoint.correct, relEndpoint.total),
    },
    obligations: {
      groundTruth: obl.gt,
      predicted: obl.predicted,
      evidenceRecall: pct(obl.matched, obl.gt),
      evidencePrecision: pct(obl.predictedMatched, obl.predicted),
      actorAccuracy: pct(obl.actor, obl.matched),
      actionAccuracy: pct(obl.action, obl.matched),
      objectAccuracy: pct(obl.object, obl.matched),
      temporalAccuracy: pct(obl.temporal, obl.temporalTotal),
      // An obligation counts as correct when its evidence matches AND both actor and action are right.
      actorActionF1: prf(obl.both, obl.predicted - obl.both, obl.gt - obl.both),
    },
    normalization: Object.fromEntries(
      Object.entries(norm).map(([k, v]) => [k, { ...v, accuracy: pct(v.correct, v.total) }]),
    ),
  };
}
results.extraction = {
  "test (inspected during rule development - see docs/evaluation.md)": scoreExtraction(
    bySplit("test"),
  ),
  "cross_domain (never inspected)": scoreExtraction(bySplit("cross_domain")),
  "control (never inspected)": scoreExtraction(bySplit("control")),
};

// 7. Consistency on adversarial / control pairs --------------------------------
{
  const perCat = {};
  for (const m of bySplit("adversarial", "control")) {
    const { rec, sys } = system(m);
    for (const x of rec.consistency_expectations) {
      const c = (perCat[x.category] ??= {
        adversarial: 0,
        detected: 0,
        evidenceCorrect: 0,
        controls: 0,
        controlFalsePositives: 0,
      });
      const hits = sys.findings.filter(
        (f) => f.pass === "CONSISTENCY" && f.category === x.category,
      );
      if (x.expected_result === "FLAG") {
        c.adversarial++;
        if (hits.length) {
          c.detected++;
          const ok = hits.some((f) =>
            f.evidence.some((e) =>
              x.expected_evidence.some((g) => overlap(e.textStart, e.textEnd, g.start, g.end) > 0),
            ),
          );
          if (ok) c.evidenceCorrect++;
        }
      } else {
        c.controls++;
        if (hits.length) c.controlFalsePositives++;
      }
    }
  }
  let ordinary = 0,
    ordinaryFlagged = 0;
  const fpByCat = {};
  for (const m of bySplit("test")) {
    const { sys } = system(m);
    ordinary++;
    const cons = sys.findings.filter((f) => f.pass === "CONSISTENCY");
    if (cons.length) ordinaryFlagged++;
    for (const f of cons) fpByCat[f.category] = (fpByCat[f.category] ?? 0) + 1;
  }
  results.consistency = {
    perCategory: Object.fromEntries(
      Object.entries(perCat).map(([k, v]) => [
        k,
        {
          ...v,
          detectionRate: pct(v.detected, v.adversarial),
          evidenceCorrectness: pct(v.evidenceCorrect, v.detected),
          controlFalsePositiveRate: pct(v.controlFalsePositives, v.controls),
        },
      ]),
    ),
    ordinaryTestDocuments: {
      documents: ordinary,
      withAnyFinding: ordinaryFlagged,
      rate: pct(ordinaryFlagged, ordinary),
      findingsByCategory: fpByCat,
    },
  };
}

// 8. Risks (unfair-clause variants + MISSING_CLAUSE) on core test documents -----
{
  const perCat = {};
  const missing = counter();
  for (const m of bySplit("test")) {
    const { rec, sys } = system(m);
    const gtCats = new Set(
      rec.risks.filter((r) => r.category !== "MISSING_CLAUSE").map((r) => r.category),
    );
    const predCats = new Set(
      sys.findings
        .filter((f) => f.pass !== "CONSISTENCY" && f.category !== "MISSING_CLAUSE")
        .map((f) => f.category),
    );
    for (const c of gtCats) add(perCat, c, predCats.has(c) ? "tp" : "fn");
    for (const c of predCats) if (!gtCats.has(c)) add(perCat, c, "fp");
    const gtMissing = new Set(
      rec.risks.filter((r) => r.category === "MISSING_CLAUSE").map((r) => r.detail.clause_type),
    );
    const predMissing = new Set(
      sys.findings
        .filter((f) => f.category === "MISSING_CLAUSE")
        .map((f) =>
          /No (.+?) clause was found/.exec(f.reason)?.[1]?.toUpperCase().replace(/ /g, "_"),
        ),
    );
    for (const c of gtMissing) missing[predMissing.has(c) ? "tp" : "fn"]++;
    for (const c of predMissing) if (!gtMissing.has(c)) missing.fp++;
  }
  results.risks = {
    perCategory: Object.fromEntries(
      Object.entries(perCat).map(([k, v]) => [k, prf(v.tp, v.fp, v.fn)]),
    ),
    missingClause: prf(missing.tp, missing.fp, missing.fn),
  };
}

// 9. Counterfactual sensitivity ------------------------------------------------------
{
  const pairs = {};
  for (const m of bySplit("counterfactual")) (pairs[m.pair_id] ??= []).push(m);
  let changes = 0,
    reflected = 0;
  for (const [, [ma, mb]] of Object.entries(pairs)) {
    const a = system(ma),
      b = system(mb);
    const keysOf = (s) => {
      const ct = new Map(s.sys.pack.entitySchema.map((e) => [e.label, e.coreType]));
      return new Set(
        s.sys.entities.map(
          (e) => `${e.label}|${valueKey(normalizeByCoreType(ct.get(e.label) ?? "TEXT", e.text))}`,
        ),
      );
    };
    const ka = keysOf(a),
      kb = keysOf(b);
    for (const c of b.rec.counterfactual.expected_changes) {
      changes++;
      const after = c.after.map((v) => `${c.label}|${valueKey(v)}`);
      const before = c.before.map((v) => `${c.label}|${valueKey(v)}`);
      if (after.every((k) => kb.has(k)) && before.every((k) => ka.has(k))) reflected++;
    }
  }
  results.counterfactual = {
    pairs: Object.keys(pairs).length,
    expectedChanges: changes,
    reflectedInExtraction: reflected,
    rate: pct(reflected, changes),
  };
}

// 10. QA benchmark ---------------------------------------------------------------------
{
  const qa = readLines(path.join(DATA, "qa/qa_benchmark.jsonl"))
    .map((l) => JSON.parse(l))
    .filter((q) => ["test", "adversarial", "control"].includes(q.split));
  const byId = new Map(manifest.map((m) => [m.doc_id, m]));
  const retrieval = getActiveRetrievalProvider();
  const stats = {};
  for (const q of qa) {
    const { sys } = system(byId.get(q.doc_id));
    let status,
      answer,
      evidence = [],
      method = "structured",
      normalized = null;
    const s = answerStructured({
      question: q.question,
      pack: sys.pack,
      entities: sys.entities,
      findings: sys.findings,
      allPacks: registry.list(),
    });
    if (s) {
      status = s.status;
      answer = s.answer;
      evidence = s.evidence;
      normalized = s.normalized;
    } else {
      method = "retrieval";
      const chunks = buildChunks(q.doc_id, sys.clauses, sys.entities);
      const hits = retrieval.retrieve(q.question, chunks, 3).filter((r) => r.score > 0);
      const res = await ExtractiveLLMProvider.generate({
        systemInstructions: "",
        question: q.question,
        evidence: hits.map((h) => ({ ...h.chunk })),
      });
      status = res.grounded ? "GROUNDED" : "NOT_SUFFICIENT";
      answer = res.answer;
      evidence = hits
        .filter((h) => (res.citedChunkIds ?? []).includes(h.chunk.chunkId))
        .map((h) => ({ textStart: h.chunk.textStart, textEnd: h.chunk.textEnd }));
    }
    const st = (stats[q.type] ??= { total: 0, correct: 0, evidenceCorrect: 0, structured: 0 });
    st.total++;
    if (method === "structured") st.structured++;
    let correct = false;
    const lower = (answer ?? "").toLowerCase();
    if (q.type === "unanswerable") correct = status === "NOT_SUFFICIENT";
    else if (q.type === "contradiction")
      correct = status === "GROUNDED" && lower.startsWith(q.expected_answer.toLowerCase());
    else if (q.type === "multi_hop")
      correct = status === "GROUNDED" && normalized?.amount === q.expected_normalized?.amount;
    else if (q.type === "cross_clause")
      correct =
        status === "GROUNDED" &&
        q.expected_answer.split("; ").every((t) => lower.includes(t.toLowerCase()));
    else
      correct =
        status === "GROUNDED" &&
        q.expected_answer.split(" and ").every((t) => lower.includes(t.toLowerCase()));
    if (correct) st.correct++;
    if (
      correct &&
      q.evidence.length &&
      evidence.some((e) =>
        q.evidence.some((g) => overlap(e.textStart ?? 0, e.textEnd ?? 0, g.start, g.end) > 0),
      )
    )
      st.evidenceCorrect++;
    if (correct && !q.evidence.length) st.evidenceCorrect++;
  }
  results.qa = Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [
      k,
      {
        ...v,
        accuracy: pct(v.correct, v.total),
        evidenceAccuracy: pct(v.evidenceCorrect, v.total),
        answeredStructurally: pct(v.structured, v.total),
      },
    ]),
  );
}

// 11. Regression: v1 adversarial set (Phase 6 categories) ---------------------------------
{
  const dir = path.join(REPO, "research/data/adversarial");
  const perCat = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".labels.json"))) {
    const l = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const sys = runSystem({
      doc_id: l.doc_id,
      document_type: l.document_type.toUpperCase(),
      raw_text: l.text,
    });
    const cat =
      l.expected_flag.category ??
      f.replace(/^control_|_[0-9a-f]+\.labels\.json$/g, "").toUpperCase();
    const c = (perCat[cat] ??= {
      positives: 0,
      detected: 0,
      controls: 0,
      controlFalsePositives: 0,
      crossCategoryFalsePositivesOnPositives: 0,
    });
    const cats = new Set(
      sys.findings.filter((x) => x.pass !== "CONSISTENCY").map((x) => x.category),
    );
    if (l.expected_flag.is_control) {
      c.controls++;
      if (cats.has(cat)) c.controlFalsePositives++;
    } else {
      c.positives++;
      if (cats.has(cat)) c.detected++;
      if ([...cats].some((x) => x !== cat && x !== "MISSING_CLAUSE"))
        c.crossCategoryFalsePositivesOnPositives++;
    }
  }
  results.v1AdversarialRegression = perCat;
}

mkdirSync(path.join(REPO, "research/eval_results"), { recursive: true });
writeFileSync(
  path.join(REPO, "research/eval_results/v3_evaluation.json"),
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    {
      detection: Object.fromEntries(
        Object.entries(results.domainDetection).map(([k, v]) => [
          k,
          [v.domainAccuracy, v.documentTypeAccuracy],
        ]),
      ),
      ner: Object.fromEntries(
        Object.entries(results.extraction).map(([k, v]) => [k.split(" ")[0], v.ner.micro.f1]),
      ),
      clauses: Object.fromEntries(
        Object.entries(results.extraction).map(([k, v]) => [k.split(" ")[0], v.clauses.micro.f1]),
      ),
      relations: Object.fromEntries(
        Object.entries(results.extraction).map(([k, v]) => [k.split(" ")[0], v.relations.micro.f1]),
      ),
      obligations: results.extraction[Object.keys(results.extraction)[0]].obligations,
      normalization: results.extraction[Object.keys(results.extraction)[0]].normalization,
      consistency: results.consistency,
      risks: results.risks,
      counterfactual: results.counterfactual,
      qa: results.qa,
      v1: results.v1AdversarialRegression,
    },
    null,
    1,
  ),
);
