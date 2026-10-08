# NyayaLens architecture

This document describes Phase 8 as built and tested on branch `phase8-multidomain`.
It covers seven domains, the semantic fact layer, the consistency engine,
domain detection, the extended knowledge graph, structured-first local Q&A,
and document comparison.

## 1. System overview

```
apps/web (Next.js 15)  ──HTTP/JSON──▶  apps/api (Express)  ──Prisma──▶  PostgreSQL 16
   workspace, compare,                   routes, auth, pipeline,          (docker compose,
   /research                             domain packs, semantic layer,     local volume)
                                         risk + consistency, graph, Q&A
                                              │
                                              ├─ local disk storage (uploaded files)
                                              ├─ tesseract.js OCR (language data from npm, offline)
                                              ├─ services/ml (Python subprocess: transformer NER, offline HF cache)
                                              └─ optional local LLM via Ollama (LLM_PROVIDER=ollama)

research/generator (Python)  ──▶  research/data/{synthetic, synthetic_v2, synthetic_v3, adversarial}
apps/api/scripts/evaluate-v3.mjs  ──▶  research/eval_results/v3_evaluation.json + docs/evaluation.md
```

Everything runs on one machine. No component calls a cloud API unless
`LLM_PROVIDER=anthropic` is set explicitly. That setting is off by default
(see `.env.example`). Setup is covered in `docs/local_setup.md`.

## 2. Repository layout

| Path | Role |
|---|---|
| `apps/api/src/routes/` | `auth`, `documents` (upload, list, detail, entities, clauses, risks, graph, ask), `semantics` (facts, obligations, relations, detection, consistency, overview), `compare`, `domain-packs`, `admin` |
| `apps/api/src/domains/` | DomainPack contract and registry, the seven packs, extraction-rule helpers, domain detection, ontology export, legal-reference metadata |
| `apps/api/src/jobs/` | In-process queue, pipeline orchestration, restart recovery |
| `apps/api/src/extraction/`, `ocr/` | PDF/DOCX text extraction, page rasterisation + OCR |
| `apps/api/src/ner/` | Legacy rule patterns + the pack-driven NER engine (`packNer.ts`), transformer NER bridge |
| `apps/api/src/clauses/` | Multi-style heading segmentation, priority-ordered clause classification |
| `apps/api/src/semantic/` | Normalization, relation + obligation extraction, semantic facts, `analyzeText`, document comparison |
| `apps/api/src/consistency/` | Data-driven consistency engine |
| `apps/api/src/risk/` | Two-pass risk engine, generic fact checks, missing-clause check, de-duplication |
| `apps/api/src/graph/`, `rag/` | Read-time knowledge graph; structured QA, chunking, BM25 retrieval, LLM providers |
| `packages/db/` | Prisma schema, migrations, generated client |
| `services/ml/` | Transformer baseline, InLegalBERT fine-tuning, evaluation |
| `research/generator/` | Synthetic generators v1, v2, v3 (`generate_v3.py`, `v3/`) and the adversarial generator |

## 3. Document pipeline

Upload (`POST /documents`) does the following:

- validates the file (magic-byte sniffing, size limit);
- validates the `documentType` slug against the DomainPack registry;
- stores the file and creates the `Document` row;
- enqueues the pipeline.

Each stage is a `ProcessingJob` row, moving `PENDING → RUNNING → SUCCEEDED/FAILED`:

| Stage (`jobType`) | Input → output | Domain-scoped? |
|---|---|---|
| `text_extraction` | file → `DocumentPage` rows + `canonicalText` | no (format-level) |
| `ocr` | pages with no native text → OCR text + confidence | no |
| `domain_detection` | `canonicalText` → `Document.domainDetection` (predicted domain/type, candidates, signals, agreement with the declared type) | compares **all** packs |
| `rule_based_ner` | `canonicalText` → `Entity` rows (`RULE_BASED`) | **yes**: legacy patterns + the pack's extraction rules, limited to its `entitySchema` |
| `clause_classification` | `canonicalText` → `DocumentClause` rows | **yes**: headings matched against the pack's `clauseSchema` |
| `semantic_extraction` | entities + clauses → `Relation` and `Obligation` rows with evidence spans | **yes**: `relationSchema`, `obligationSchema` |
| `generic_transformer_ner` | `canonicalText` → `Entity` rows (`GENERIC_*` labels) | no (general-purpose model) |
| `risk_engine` | clauses + entities + semantic analysis → `Risk` rows (Pass 1, Pass 2, CONSISTENCY) | **yes**: `riskSchema`, `consistencyRules` |

A stage failure doesn't block independent later stages. Job state lives in
Postgres, and `recovery.ts` re-enqueues interrupted jobs after a restart.

Domain detection never re-labels a document. A mismatch is stored and shown
in the workspace as a review notice. The detector is a deterministic count
of title and wording signals, and it produces no probability or confidence
number.

## 4. Domain packs

The pipeline never branches on a document type. It asks the registry for
`forDocumentType(document.documentType)` and runs that pack's data and
checks. The contract is in `docs/domain_packs.md`. Seven domains are
registered: `residential_rental`, `land_lease`, `leave_and_license`,
`sale_property`, `builder_buyer`, `employment` and `nda_msa`. Together they
cover 13 document types.

## 5. Semantic fact layer

`semantic/analyze.ts` (`analyzeText`) is the single pure entry point. Both
the pipeline and the evaluation harness call it.

- **Normalization** (`normalize.ts`): money to INR amounts (₹ / Rs. / INR,
  lakh/crore grouping), dates to ISO, durations to value + unit + days,
  percentages, areas with units, identifiers.
- **Relations** (`extract.ts`): schema-driven. For example,
  `BUYER -MUST_PAY-> BALANCE_AMOUNT` or `DOCUMENT -HAS_TERM-> DURATION`.
  Each relation keeps its clause and span.
- **Obligations** (`extract.ts`): sentence-level. An obligation needs a
  modal verb ("shall", "must", "agrees to"), a party term and a verb from
  the domain's lexicon. Passive voice is handled. The record holds:
  - actor, action, object/amount, deadline, frequency, condition;
  - `unexpectedActor`, set when the pack does not expect that actor for
    the action.
- **Facts** (`facts.ts`): built at read time from persisted rows. They come
  in three groups: subject–predicate–value facts, temporal facts and
  financial facts. Each fact carries a page number and evidence text.

## 6. Risk and consistency engines

- **Pass 1** (`risk/pass1PerClause.ts`) runs the pack's per-clause checks
  and the generic fact checks in `risk/factChecks.ts`: unbounded
  discretion, liability shift, uncapped liability, restrictive covenant,
  and one-way confidentiality in a "mutual" NDA.
- **Pass 2** (`risk/pass2CrossClause.ts`) runs cross-clause checks:
  asymmetric notice, one-sided remedy and land-use contradiction.
  `MISSING_CLAUSE` findings come from the pack's
  `expectedClauseTypesByDocumentType`.
- **Consistency** (`consistency/engine.ts`) evaluates the pack's
  data-driven rules:
  - `SINGLE_VALUE`: the same field stated with different values;
  - `SUM`: instalments must add up to the total;
  - `DATE_ORDER`: dates must fall in the right order;
  - `EXPECTED_ACTOR`: an obligation's actor must fit the pack's schema.

  Findings use the pass `CONSISTENCY` and carry a `ruleId`, with
  `reviewRequired = true`.
- Every finding carries evidence spans. `risk/reasonFraming.ts` checks the
  reason text for non-definitive framing: findings say "potential issue …
  review required", never "illegal". `risk/dedupe.ts` removes repeated
  findings.

## 7. Knowledge graph, Q&A and comparison

- **Graph.** `graph/buildGraph.ts` builds the graph at read time from
  persisted rows.
  - Node types: DOCUMENT, CLAUSE, ENTITY (with its core type),
    RISK_FINDING, OBLIGATION, EVENT (deadlines) and LEGAL_REFERENCE.
  - Original edge types: HAS_CLAUSE, HAS_ENTITY, REFERENCES, FLAGS and
    COMPARED_WITH.
  - New edge types:
    - typed `RELATION` edges (`label` = SELLS_TO, MUST_PAY, …);
    - HAS_OBLIGATION, MUST_PERFORM (`MUST_<action>`) and DUE_ON;
    - CONTRADICTS, linking values a consistency finding found in conflict;
    - RELEVANT_TO, for legal references.

  The graph never uses an "APPLIES_TO" edge (see
  `legal_reference_policy.md`).
- **`POST /documents/:id/ask`** (`rag/runAsk.ts`) answers in two steps:
  1. **Structured first** (`rag/structuredQa.ts`). The question is matched
     against the pack's display names and question cues ("who" → party,
     "how much" → money). It is answered from the document's extracted
     facts, with the exact spans as evidence. This covers several question
     shapes:
     - fact questions;
     - "A and B" questions;
     - consistency questions ("Is the fee stated consistently?");
     - differences ("How much remains after the advance?").

     A field that belongs to another domain gets NOT_SUFFICIENT.
  2. **Retrieval fallback.** Questions asking for clause wording ("what
     does … say"), and anything the ontology does not cover, go to the
     Phase 7A path: chunks → BM25 top-3 → LLM provider → cited sources.
     The providers are:
     - `extractive` (the default);
     - `ollama` (local; citations are validated server-side);
     - `anthropic` (opt-in, unverified).

  Every answer reports `evidenceStatus` (GROUNDED or NOT_SUFFICIENT) and
  its `method`. Every source carries its clause type and number and its
  page.
- **`GET /compare?a=&b=`** (`semantic/compare.ts`) compares two documents
  item by item. Each item is SAME, CHANGED, ADDED (only in B) or REMOVED
  (only in A). It covers key terms (compared on normalized values),
  clauses, obligations, relations and risk categories. The caller must own
  both documents; otherwise the response is a 404.

## 8. Security

- Argon2id password hashing.
- JWT access tokens and rotating refresh tokens, with family revocation on
  reuse.
- RBAC (`USER`/`ADMIN`).
- Every document route checks ownership in the same query that loads the
  row. This includes all Phase 8 routes; `/compare` requires ownership of
  both documents.
- Uploads are sniffed by magic bytes and size-limited.
- Helmet headers are set.
- `/ask` is rate-limited per user, and document text is treated as data,
  not instructions.

Known gaps (from the Phase 8 audit, not yet fixed): `cors()` allows any
origin, and `/auth/login` has no rate limit.

## 9. Data and evaluation assets

| Dataset | Size | Notes |
|---|---|---|
| `research/data/synthetic/` (v1) | 300 docs | Template-generated; basis of the Phase 4B/6/7A numbers |
| `research/data/adversarial/` | 150 docs | 75 adversarial + 75 matched controls, 5 risk categories; Phase 8 regression set |
| `research/data/synthetic_v2/` | 1,200 docs | Git-ignored, reproducible from seed 2026 |
| `research/data/synthetic_v3/` | 3,640 docs | Git-ignored, reproducible with `generate_v3.py --seed 2027`; 7 domains, 11 annotation layers, adversarial/control, counterfactual and cross-domain sets, 45,275 QA items (`docs/dataset_card.md`) |
| `research/data/real/` | empty | No real-document evaluation exists yet |

All reported metrics are synthetic-only. The Phase 8 numbers are in
`docs/evaluation.md`, which the harness generates. Earlier phases are
covered in `docs/architecture/*_results.md`.
