"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PermanentNotice } from "@/components/ui/PermanentNotice";
import { humanizeLabel } from "@/lib/format";

// Phase 8 public research page (spec section 37): what the system is, how
// it is built, and the CURRENT measured results - read from the evaluation
// output files via /api/research-stats, never hardcoded. Public: it shows
// no user data, only architecture and synthetic-benchmark numbers.

const PIPELINE = [
  {
    title: "Upload",
    body: "PDF/DOCX, declared document type validated against the DomainPack registry",
  },
  {
    title: "Text + OCR",
    body: "Native text, local Tesseract OCR fallback; canonical text with page offsets",
  },
  {
    title: "Domain detection",
    body: "Deterministic title/wording signals; a mismatch is reported, never silently corrected",
  },
  {
    title: "Entities + clauses",
    body: "Document-scoped rules from the domain's pack; multi-style clause segmentation",
  },
  {
    title: "Semantic layer",
    body: "Relations, obligations (ACTOR must ACTION), normalized money/dates/durations",
  },
  {
    title: "Risk + consistency",
    body: "Pass 1 / Pass 2 risk checks and a data-driven consistency engine",
  },
  {
    title: "Graph + Ask",
    body: "Knowledge graph; structured-first local Q&A with evidence status",
  },
];

const DOMAINS = [
  { name: "Residential rental", types: "Rental agreement" },
  { name: "Land lease", types: "Land lease deed" },
  { name: "Leave and licence", types: "Leave and licence agreement" },
  { name: "Sale of property", types: "Agreement to sell, sale deed" },
  { name: "Builder-buyer", types: "Builder-buyer agreement" },
  { name: "Employment", types: "Employment contract, offer letter, appointment letter" },
  { name: "NDA / services", types: "NDA, mutual NDA, service agreement, MSA" },
];

const PACK_PARTS = [
  ["Entity schema", "roles (BUYER, LICENSEE, CTC...) mapped onto 12 core types"],
  ["Extraction rules", "party terms, value cues, document-scoped NER"],
  ["Clause schema", "heading patterns with explicit priorities"],
  ["Relation schema", "SUBJECT -RELATION-> OBJECT, e.g. BUYER MUST_PAY BALANCE"],
  ["Obligation schema", "actions, expected actors, verb lexicon"],
  ["Risk schema", "expected clauses per document type, fact checks"],
  ["Consistency rules", "single value, sum, date order, expected actor"],
  ["Detection signals", "title and lexical patterns per document type"],
  ["Legal references", "unverified metadata - never an applicability claim"],
];

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const pct = (v: unknown) => {
  const n = num(v);
  return n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
};

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded border border-ink-100 bg-paper-50 p-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink-800">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink-400">{note}</p>}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = `s${n}`;
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="flex items-baseline gap-2 text-base font-semibold text-ink-800">
        <span className="text-xs font-medium text-saffron-700">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}

// A static SVG of the pipeline - no diagram library, renders identically
// everywhere and prints cleanly.
function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, label: string, sub: string, dark = false) => (
    <g key={label}>
      <rect
        x={x}
        y={y}
        width={w}
        height={46}
        rx={6}
        fill={dark ? "#181d27" : "#fdfcfa"}
        stroke={dark ? "#181d27" : "#cbd1db"}
      />
      <text
        x={x + w / 2}
        y={y + 20}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={dark ? "#fdfcfa" : "#181d27"}
      >
        {label}
      </text>
      <text
        x={x + w / 2}
        y={y + 36}
        textAnchor="middle"
        fontSize="10"
        fill={dark ? "#cbd1db" : "#6b7690"}
      >
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line
      key={key}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#9aa4b5"
      strokeWidth={1.2}
      markerEnd="url(#arrow)"
    />
  );
  return (
    <svg
      viewBox="0 0 720 300"
      role="img"
      aria-label="NyayaLens architecture: document to OCR, domain detection, extraction, semantic layer, risk and consistency engines, then knowledge graph, local Q&A and workspace"
      className="h-auto w-full"
      data-testid="architecture-diagram"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#9aa4b5" />
        </marker>
      </defs>
      {box(10, 20, 120, "Document", "PDF / DOCX", true)}
      {box(160, 20, 120, "Text + OCR", "local Tesseract")}
      {box(310, 20, 130, "Domain detection", "signals, no scores")}
      {box(470, 20, 240, "DomainPack registry", "7 domains, 13 document types", true)}
      {box(160, 110, 150, "Entities + clauses", "document-scoped rules")}
      {box(340, 110, 160, "Semantic fact layer", "relations, obligations")}
      {box(530, 110, 180, "Risk + consistency", "fact checks, rules")}
      {box(160, 210, 150, "Knowledge graph", "typed, evidence-linked")}
      {box(340, 210, 160, "Local Q&A", "structured, then BM25")}
      {box(530, 210, 180, "Workspace + compare", "every value -> its span")}
      {arrow(130, 43, 158, 43, "a1")}
      {arrow(280, 43, 308, 43, "a2")}
      {arrow(440, 43, 468, 43, "a3")}
      {arrow(370, 66, 240, 108, "a4")}
      {arrow(310, 133, 338, 133, "a5")}
      {arrow(500, 133, 528, 133, "a6")}
      {arrow(590, 66, 590, 108, "a7")}
      {arrow(420, 156, 240, 208, "a8")}
      {arrow(420, 156, 420, 208, "a9")}
      {arrow(620, 156, 620, 208, "a10")}
    </svg>
  );
}

export default function ResearchPage() {
  const [stats, setStats] = useState<{ dataset: unknown; evaluation: unknown } | null>(null);
  useEffect(() => {
    fetch("/api/research-stats")
      .then((r) => r.json() as Promise<{ dataset: unknown; evaluation: unknown }>)
      .then(setStats)
      .catch(() => setStats({ dataset: null, evaluation: null }));
  }, []);

  const dataset = obj(stats?.dataset);
  const evaluation = obj(stats?.evaluation);
  const extraction = obj(evaluation.extraction);
  // The split nobody looked at during rule development is the headline.
  const heldOutKey = Object.keys(extraction).find((k) => k.startsWith("cross_domain"));
  const heldOut = obj(heldOutKey ? extraction[heldOutKey] : undefined);
  const micro = (k: string) => obj(obj(heldOut[k]).micro).f1;
  const qa = obj(evaluation.qa);
  const consistency = obj(obj(evaluation.consistency).perCategory);
  const detection = obj(obj(evaluation.domainDetection)["test (all domains)"]);
  const splits = obj(dataset.documents_per_split);

  return (
    <div className="min-h-screen bg-paper-100">
      <header className="flex h-12 items-center justify-between border-b border-ink-200 bg-paper-50 px-4">
        <Link href="/" className="text-sm font-semibold tracking-wide text-ink-800">
          NYAYALENS
        </Link>
        <Link href="/documents" className="text-sm text-info-strong hover:underline">
          Open workspace
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-saffron-700">
          Research and engineering notes
        </p>
        <h1 className="mt-1 text-page-title text-ink-900">
          NyayaLens: evidence-grounded reading of Indian legal agreements
        </h1>
        <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[
            "What is NyayaLens?",
            "Problem",
            "Solution",
            "Supported domains",
            "Architecture",
            "DomainPack architecture",
            "NLP pipeline",
            "Semantic fact layer",
            "Risk engine",
            "Knowledge graph",
            "Local RAG",
            "Synthetic dataset",
            "Evaluation",
            "Security",
            "Privacy / local-first",
            "Limitations",
            "Future work",
          ].map((t, i) => (
            <a key={t} href={`#s${i + 1}`} className="text-info-strong hover:underline">
              {t}
            </a>
          ))}
        </nav>

        <Section n={1} title="What is NyayaLens?">
          <p>
            NyayaLens reads Indian legal agreements - rental and leave-and-licence agreements, land
            leases, property sales, builder-buyer agreements, employment documents and NDAs/service
            agreements - and turns them into structured, reviewable information: who the parties
            are, what each must do, the amounts, dates and durations, potential issues, and answers
            to questions. Every item links back to the exact text it came from.
          </p>
        </Section>

        <Section n={2} title="Problem">
          <p>
            Agreements are long and repetitive, and the terms that matter - a deposit stated
            differently in two places, a one-sided termination right, an uncapped indemnity - are
            easy to miss. General-purpose AI assistants can summarise them, but they can also invent
            terms that the document does not contain, and they usually need the document to leave
            the user&apos;s machine.
          </p>
        </Section>

        <Section n={3} title="Solution">
          <p>
            A local pipeline built around evidence: domain-specific extraction, a semantic fact
            layer, rule-based risk and consistency checks, a knowledge graph and question answering
            that answers from extracted facts first. Nothing is presented without a source span;
            when the document does not support an answer, the system says so.
          </p>
        </Section>

        <Section n={4} title="Supported domains">
          <ul className="grid gap-2 sm:grid-cols-2">
            {DOMAINS.map((d) => (
              <li key={d.name} className="rounded border border-ink-100 bg-paper-50 px-3 py-2">
                <p className="text-sm font-medium text-ink-800">{d.name}</p>
                <p className="text-xs text-ink-500">{d.types}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={5} title="Architecture">
          <div className="rounded border border-ink-200 bg-paper-50 p-3">
            <ArchitectureDiagram />
          </div>
          <p className="mt-2">
            A Next.js workspace talks to an Express API backed by PostgreSQL. Processing runs as a
            job pipeline per document; every stage records its own status, so a failure in an
            optional stage (such as the transformer NER baseline) never blocks the others.
          </p>
        </Section>

        <Section n={6} title="DomainPack architecture">
          <p>
            Each domain is a DomainPack - a declarative bundle the pipeline reads. Adding a domain
            means adding a pack, not changing the pipeline. A pack contains:
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {PACK_PARTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-medium text-ink-700">{k}</dt>
                <dd className="text-ink-500">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section n={7} title="NLP pipeline">
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="architecture">
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="rounded border border-ink-200 bg-paper-50 p-3">
                <span className="text-xs font-medium text-saffron-700">Stage {i + 1}</span>
                <p className="text-sm font-medium text-ink-800">{step.title}</p>
                <p className="mt-0.5 text-xs text-ink-500">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section n={8} title="Semantic fact layer">
          <p>
            Extracted values become facts with a subject, predicate, normalized value and evidence
            span: amounts in rupees (&ldquo;Rs. 23,70,000&rdquo; = 2,370,000), ISO dates, durations
            in days, areas with units. Sentences such as &ldquo;The Buyer shall pay the balance
            within 30 days&rdquo; become obligations - actor, action, amount, deadline, frequency,
            condition - and an actor the domain does not expect for that action is flagged for
            review.
          </p>
        </Section>

        <Section n={9} title="Risk engine">
          <p>
            Pass 1 checks single clauses (unbounded discretion, liability shifts, uncapped
            liability, restrictive covenants); Pass 2 compares clauses (asymmetric notice, one-sided
            remedies, missing expected clauses). A consistency engine checks values stated more than
            once - amounts, dates, durations, areas, survey numbers, party names, instalments that
            must add up. Every finding is phrased as a potential issue for review, never a legal
            conclusion.
          </p>
        </Section>

        <Section n={10} title="Knowledge graph">
          <p>
            Built at read time from persisted rows: document, clauses, entities, obligations,
            deadline events, risk findings and legal-reference nodes; typed relation edges
            (SELLS_TO, MUST_PAY), MUST_PERFORM and DUE_ON edges, CONTRADICTS edges between
            conflicting values, and RELEVANT_TO (never &ldquo;applies to&rdquo;) for unverified
            legal references.
          </p>
        </Section>

        <Section n={11} title="Local RAG">
          <p>
            Questions are first matched against the document&apos;s own facts (&ldquo;Who is the
            licensee?&rdquo;, &ldquo;How much remains after the advance?&rdquo;, &ldquo;Is the fee
            stated consistently?&rdquo;). Other questions fall back to BM25 retrieval over clauses
            with an extractive answer, or a local Ollama model if configured. Every answer is
            GROUNDED, with clause, page and evidence text, or NOT SUFFICIENT; a question about a
            term from a different kind of document is refused rather than answered from loosely
            related text.
          </p>
        </Section>

        <Section n={12} title="Synthetic dataset">
          {stats === null ? (
            <p className="text-ink-400">Loading...</p>
          ) : stats.dataset === null ? (
            <p className="text-ink-400">No dataset report has been generated yet.</p>
          ) : (
            <>
              <p>
                Generated, never hand-labelled: each document carries exact spans for entities,
                clauses, relations, obligations, temporal and financial facts, risks, consistency
                expectations and QA items. Adversarial documents have a control twin from the same
                seed; counterfactual pairs differ in exactly one value.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <Metric label="Documents" value={String(num(dataset.total_documents) ?? "n/a")} />
                <Metric
                  label="QA items"
                  value={String(num(obj(dataset.qa_benchmark).total) ?? "n/a")}
                />
                <Metric
                  label="Train / dev / test"
                  value={`${String(num(splits.train) ?? "-")} / ${String(num(splits.dev) ?? "-")} / ${String(num(splits.test) ?? "-")}`}
                />
                <Metric
                  label="Adversarial / control"
                  value={`${String(num(splits.adversarial) ?? "-")} / ${String(num(splits.control) ?? "-")}`}
                />
                <Metric
                  label="Near-duplicate rate"
                  value={pct(dataset.near_duplicate_rate)}
                  note="MinHash, Jaccard >= 0.8"
                />
                <Metric
                  label="Train/test leakage"
                  value={String(num(dataset.train_test_leakage_count) ?? "n/a")}
                />
                <Metric
                  label="Invalid annotations"
                  value={String(num(dataset.invalid_annotation_count) ?? "n/a")}
                />
              </div>
            </>
          )}
        </Section>

        <Section n={13} title="Evaluation">
          {stats === null ? (
            <p className="text-ink-400">Loading...</p>
          ) : stats.evaluation === null ? (
            <p className="text-ink-400">The evaluation has not been run yet.</p>
          ) : (
            <>
              <p className="text-xs text-ink-400">
                Extraction scores are on the cross-domain split, which was never inspected while the
                rules were written. Full report: docs/evaluation.md.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Metric label="Entity F1" value={pct(micro("ner"))} />
                <Metric label="Clause F1" value={pct(micro("clauses"))} />
                <Metric label="Relation F1" value={pct(micro("relations"))} />
                <Metric
                  label="Obligation (actor + action) F1"
                  value={pct(obj(obj(heldOut.obligations).actorActionF1).f1)}
                />
                <Metric label="Domain detection accuracy" value={pct(detection.domainAccuracy)} />
                <Metric
                  label="Counterfactual changes reflected"
                  value={pct(obj(evaluation.counterfactual).rate)}
                />
              </div>
              <h3 className="mt-5 text-sm font-medium text-ink-700">Question answering</h3>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-xs text-ink-400">
                  <tr>
                    <th className="py-1 font-normal">Question type</th>
                    <th className="py-1 font-normal">Items</th>
                    <th className="py-1 font-normal">Answer accuracy</th>
                    <th className="py-1 font-normal">Evidence accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(qa).map(([type, v]) => (
                    <tr key={type} className="border-t border-ink-100">
                      <td className="py-1 text-ink-700">{humanizeLabel(type)}</td>
                      <td className="py-1 text-ink-500">{String(num(obj(v).total) ?? "n/a")}</td>
                      <td className="py-1 text-ink-700">{pct(obj(v).accuracy)}</td>
                      <td className="py-1 text-ink-700">{pct(obj(v).evidenceAccuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-5 text-sm font-medium text-ink-700">Consistency engine</h3>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-xs text-ink-400">
                  <tr>
                    <th className="py-1 font-normal">Category</th>
                    <th className="py-1 font-normal">Detection</th>
                    <th className="py-1 font-normal">Control false positives</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(consistency).map(([cat, v]) => (
                    <tr key={cat} className="border-t border-ink-100">
                      <td className="py-1 text-ink-700">{humanizeLabel(cat)}</td>
                      <td className="py-1 text-ink-700">
                        {pct(obj(v).detectionRate)} ({String(num(obj(v).detected) ?? 0)}/
                        {String(num(obj(v).adversarial) ?? 0)})
                      </td>
                      <td className="py-1 text-ink-700">{pct(obj(v).controlFalsePositiveRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        <Section n={14} title="Security">
          <p>
            Argon2id password hashing, short-lived JWT access tokens with rotating refresh tokens,
            and ownership enforced in the same query that loads a document - on every endpoint,
            including the Phase 8 facts, obligations, consistency, overview and comparison APIs (a
            comparison needs ownership of both documents). Retrieved document text is treated as
            data, never as instructions, and prompt-injection cases are part of the test suite.
          </p>
        </Section>

        <Section n={15} title="Privacy / local-first design">
          <p>
            Documents, OCR, extraction and question answering stay on the machine running NyayaLens.
            Fonts and the OCR model are bundled; the optional transformer baseline runs offline
            after a one-time download; the optional generative model runs in a local Ollama server.
            No cloud AI API is required for any feature.
          </p>
        </Section>

        <Section n={16} title="Limitations">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              All reported numbers are on synthetic documents from the project&apos;s own generator;
              real-world accuracy is unmeasured.
            </li>
            <li>
              Extraction is rule-based. Unusual headings or phrasings are missed, and a missed
              clause heading also produces a false &ldquo;missing clause&rdquo; finding.
            </li>
            <li>No model was trained or fine-tuned for these results.</li>
            <li>
              Legal reference metadata is unverified and is shown only as a pointer for further
              reading, never as a statement that a law applies.
            </li>
            <li>English only; scanned documents depend on OCR quality.</li>
          </ul>
        </Section>

        <Section n={17} title="Future work">
          <ul className="list-disc space-y-1 pl-5">
            <li>A small, consented set of real, anonymised agreements for honest evaluation.</li>
            <li>Training document-scoped NER on the v3 data and comparing it with the rules.</li>
            <li>Local embeddings and a reranker for the retrieval fallback.</li>
            <li>Hindi and bilingual documents.</li>
            <li>Verified statutory references, reviewed by a qualified lawyer.</li>
          </ul>
        </Section>

        <div className="mt-10">
          <PermanentNotice>
            These results are measured on synthetic documents generated by the same project that
            wrote the extraction rules, so they show the system works on the forms it was built for
            - not how it performs on real-world documents, whose wording varies far more. No model
            was trained or fine-tuned for these numbers. NyayaLens flags provisions for review; it
            does not give legal advice, and its legal reference metadata is unverified.
          </PermanentNotice>
        </div>
      </main>
    </div>
  );
}
