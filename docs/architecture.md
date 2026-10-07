# NyayaLens architecture

Status as of Phase 8, Milestone 1 (branch `phase8-multidomain`). Sections
marked **Planned** describe the Phase 8 target and are not built yet;
everything else describes code that exists and is tested.

## 1. System overview

```
apps/web (Next.js 15)  ──HTTP/JSON──▶  apps/api (Express)  ──Prisma──▶  PostgreSQL 16
   workspace UI                          routes, auth, pipeline,          (docker compose,
   upload, ask, graph                    domain packs, risk, RAG           local volume)
                                              │
                                              ├─ local disk storage (uploaded files)
                                              ├─ tesseract.js OCR (language data from npm, offline)
                                              ├─ services/ml (Python subprocess: transformer NER, offline HF cache)
                                              └─ optional local LLM via Ollama (LLM_PROVIDER=ollama)

research/generator (Python)  ──▶  research/data/{synthetic, synthetic_v2, adversarial}
services/ml (Python)         ──▶  evaluation / fine-tuning against Postgres + ground-truth labels
```

Everything runs on one machine. No component calls a cloud API unless
`LLM_PROVIDER=anthropic` is set explicitly (off by default; see
`.env.example`).

## 2. Repository layout

| Path | Role |
|---|---|
| `apps/api/src/routes/` | `auth`, `documents` (upload, list, detail, entities, clauses, risks, graph, ask), `domain-packs`, `admin` |
| `apps/api/src/domains/` | DomainPack contract, registry, the two packs, shared legal-reference metadata |
| `apps/api/src/jobs/` | In-process queue, pipeline orchestration, restart recovery |
| `apps/api/src/extraction/`, `ocr/` | PDF/DOCX text extraction, page rasterisation + OCR |
| `apps/api/src/ner/`, `clauses/` | Rule-based NER, heading segmentation + clause classification, transformer NER bridge |
| `apps/api/src/risk/` | Two-pass risk engine (per-clause, cross-clause) driven by the document's pack |
| `apps/api/src/graph/`, `rag/` | Read-time knowledge graph; chunking, BM25 retrieval, LLM providers |
| `packages/db/` | Prisma schema, migrations, generated client |
| `services/ml/` | Transformer baseline, InLegalBERT fine-tuning, evaluation |
| `research/generator/` | Synthetic generators v1 (`generator.py`), v2 (`generator_v2.py`), adversarial |

## 3. Document pipeline

Upload (`POST /documents`) validates the file (magic-byte sniffing, size
limit) and the `documentType` slug against the DomainPack registry, stores
the file, creates the `Document` row, and enqueues the pipeline. Each stage
is a `ProcessingJob` row (`PENDING → RUNNING → SUCCEEDED/FAILED`):

| Stage (`jobType`) | Input → output | Domain-scoped? |
|---|---|---|
| `text_extraction` | file → `DocumentPage` rows + `canonicalText` | no (format-level) |
| `ocr` | pages with no native text → OCR text + confidence | no |
| `rule_based_ner` | `canonicalText` → `Entity` rows (`RULE_BASED`) | **yes** - only the pack's `entitySchema` labels |
| `clause_classification` | `canonicalText` → `DocumentClause` rows | **yes** - headings matched against the pack's `clauseSchema` |
| `generic_transformer_ner` | `canonicalText` → `Entity` rows (`GENERIC_*` labels) | no (general-purpose model) |
| `risk_engine` | clauses + entities → `Risk` rows (Pass 1 + Pass 2) | **yes** - the pack's `riskSchema` |

A stage failure doesn't block independent later stages. Job state lives in
Postgres; `recovery.ts` re-enqueues interrupted jobs after a restart.

**Planned (Milestones 4-5):** domain detection before NER, then relation,
obligation, temporal and financial extraction feeding a semantic-fact
layer that the risk engine, a consistency auditor, the graph and RAG all
read from.

## 4. Domain packs

The pipeline never branches on a document type. It asks the registry for
`forDocumentType(document.documentType)` and runs that pack's data and
checks. See `docs/domain_packs.md` for the contract. Registered today:
`residential_rental`, `land_lease`. **Planned (Milestone 2):**
`leave_and_license`, `sale_property`, `builder_buyer`, `employment`,
`nda_msa`.

## 5. Risk engine

- **Pass 1** (`risk/pass1PerClause.ts`): runs the pack's `perClauseChecks`
  (e.g. liability shift, unbounded discretion, missing expected clauses).
- **Pass 2** (`risk/pass2CrossClause.ts`): runs the pack's
  `comparisonChecks` across clauses/entities (asymmetric notice periods,
  land-use contradiction).
- Every finding carries evidence spans (clause/entity id, offsets, text).
  Reason text is checked for non-definitive framing (`risk/reasonFraming.ts`):
  findings say "may indicate… warrants review", never "illegal".

## 6. Knowledge graph and RAG

- `graph/buildGraph.ts` builds a graph at read time: DOCUMENT → CLAUSE /
  ENTITY / RISK_FINDING nodes, with every node backed by a persisted row.
- `/documents/:id/ask`: chunks (one per clause + one per preamble entity) →
  BM25 top-3 → LLM provider → cited sources. Providers: `extractive`
  (default, quotes evidence), `ollama` (local generative, citations
  validated server-side, falls back to extractive), `anthropic` (opt-in
  cloud, unverified). The system prompt treats document text as data, and
  `/ask` is rate-limited per user.

## 7. Security

Argon2id password hashing; JWT access tokens + rotating refresh tokens
with family revocation on reuse; RBAC (`USER`/`ADMIN`); every document
route checks ownership in the same query that loads the row; uploads are
sniffed by magic bytes and size-limited; helmet headers. Known gaps (from
the Phase 8 audit, not yet fixed): `cors()` allows any origin, and
`/auth/login` has no rate limit.

## 8. Data and evaluation assets

| Dataset | Size | Notes |
|---|---|---|
| `research/data/synthetic/` (v1) | 300 docs | Template-generated; basis of all published Phase 4B/6/7A numbers |
| `research/data/adversarial/` | 150 docs | 75 adversarial + 75 matched controls, 5 risk categories |
| `research/data/synthetic_v2/` | 1,200 docs | Git-ignored, reproducible from seed 2026; consistent geography, 6 heading styles, held-out-template test split, injected risks, 140 simulated scans |
| `research/data/real/` | empty | No real-document evaluation exists yet |

All reported metrics are synthetic-only. See `docs/architecture/*_results.md`.
