# NyayaLens

Indian legal document intelligence platform. Converts residential rental
agreements and land lease deeds into structured, evidence-grounded
information — entities, clauses, relations, risks, and (eventually) a
knowledge graph, with every extracted fact carrying provenance back to
its source document.

**This repository currently implements Phase 1-7B**: repository
scaffolding, the database schema, authentication (Phase 1-2); document
upload, storage, and canonical-text extraction (Phase 3); OCR, rule-based
NER, a generic-transformer NER baseline, and rule-based clause
classification (Phase 4A); InLegalBERT fine-tuning and StratifiedGroupKFold
evaluation across all three model sources (Phase 4B — real, measured
results in `docs/architecture/evaluation_results.md`, synthetic-only); a
two-pass cross-clause/cross-entity risk engine covering five risk
categories plus an adversarial synthetic test generator and evaluation
(Phase 6 — real, measured results in
`docs/architecture/adversarial_evaluation_results.md`, synthetic-only); a
read-time knowledge graph and a grounded, provenance-backed RAG
question-answering backend with a prompt-injection defense (Phase 7A —
real, measured results in
`docs/architecture/rag_evaluation_results.md`, synthetic-only); and a
premium document-intelligence workspace UI — document viewer with
entity/clause highlighting, an intelligence panel (overview/entities/
clauses/risks/graph/ask), and mandatory, permanent trust/evidence
indicators on every risk finding and every RAG answer (Phase 7B).
Embeddings/vector search and real generative answer synthesis (no LLM key
is configured in this environment - see `rag_design.md`) do not exist
yet — see `docs/architecture/*.md` for what's reserved-but-unimplemented
and why.

Commercial leases and general contracts are explicitly out of scope for
this project.

## Repository layout

```
apps/
  web/      Next.js frontend - the legal-intelligence workspace (Phase 7B)
    src/app/documents/            Document list ("case files") + [id] workspace route
    src/app/how-it-works/         Trust/transparency explainer page
    src/app/api/eval-stats/       Next-internal route reading real evaluation result
                                   files, so risk/RAG limitation copy is never stale
    src/components/shell/         App shell (sidebar, top bar)
    src/components/workspace/     Document viewer, intelligence panel tabs
                                   (Overview/Entities/Clauses/Risks/Graph/Ask),
                                   evidence-focus navigation, graph view (reactflow)
    src/components/ui/            Design-token-driven primitives (Button, Badge,
                                   Tabs, PermanentNotice, empty/loading/error states)
    src/lib/spans.ts               Overlap-safe clause/entity span segmentation
                                   (Section 11) - the document viewer's core logic
    tailwind.config.ts             Centralized color/type/spacing design tokens
  api/      Node/Express + TypeScript API (auth, RBAC, upload, extraction pipeline)
    src/storage/      Local-disk storage adapter (swappable interface)
    src/extraction/   PDF/DOCX canonical text extraction
    src/ocr/          PDF page rasterization + Tesseract OCR
    src/ner/          Rule-based NER + generic-transformer NER subprocess call
    src/clauses/      Rule-based clause segmentation/classification
    src/risk/         Phase 6 risk engine (Pass 1 per-clause, Pass 2 cross-clause/entity registry)
    src/graph/        Phase 7A knowledge graph (read-time construction from persisted data)
    src/rag/          Phase 7A RAG (chunking, RetrievalProvider/LLMProvider interfaces + implementations)
    src/jobs/         In-process async pipeline (queue, stages, startup recovery)
    rag_eval/         Phase 7A RAG quality test set + evaluation output (quality_test_set.json)
    scripts/          validate-extraction-sample.mjs (Phase 4A pipeline sanity check),
                       bulk-upload-adversarial.mjs / evaluate-adversarial.mjs /
                       evaluate-ordinary-control-fp.mjs (Phase 6),
                       evaluate-graph.mjs / evaluate-rag.mjs /
                       evaluate-rag-security.mjs (Phase 7A),
                       analyze-refusal-scores.mjs (Phase 7A addendum)
packages/
  db/       Prisma schema, migrations, seed script, shared DB client
services/
  ml/       Python: generic-transformer NER baseline, (Phase 4B) fine-tuning + evaluation
research/
  data/
    synthetic/   300 synthetic documents (150 residential rental, 150 land lease)
    real/        Empty - real documents (target 15+15) not yet collected
    adversarial/ 150 adversarial + matched-control risk-engine test documents (Phase 6)
  generator/     Python source that generated the synthetic dataset, plus
                 adversarial_generator.py / generate_adversarial_batch.py (Phase 6)
docs/
  full_spec.md            Placeholder - see note inside
  architecture/           Design docs (database, auth, migrations, provenance, schema,
                           evaluation_design, document_ingestion, extraction_pipeline,
                           evaluation_results - the real Phase 4B numbers, risk_engine,
                           adversarial_evaluation_results - the real Phase 6 numbers,
                           knowledge_graph, rag_design, rag_evaluation_results - the
                           real Phase 7A numbers)
  research/                Adversarial test case design
```

## Prerequisites

- Node.js >= 20 and npm >= 10
- Docker (for local PostgreSQL via `docker-compose.yml`) **or** a
  PostgreSQL 16 instance you already have running
- Python 3.10+ - required for `research/generator/` (dataset generation,
  optional) and `services/ml/` (the generic-transformer NER baseline and
  Phase 4B fine-tuning/evaluation, optional - the rest of the app runs
  without it)

## Setup (fresh clone)

```powershell
# 1. Install all workspace dependencies
npm install

# 2. Copy the env template and fill in real secrets
copy .env.example .env
# Edit .env: set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET to two different
# random 64-char hex strings, e.g.:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start PostgreSQL
docker compose up -d postgres
# (or point DATABASE_URL in .env at an existing Postgres instance)

# 4. Generate the Prisma client and apply migrations to a fresh database
npm run db:generate
npm run db:migrate:deploy

# 5. Load synthetic dataset metadata into the database
npm run db:seed

# 6. Run the API and web app (separate terminals)
npm run dev:api
npm run dev:web
```

The API listens on `http://localhost:4000` (see `API_PORT` in `.env`);
the web app on `http://localhost:3000`.

### Optional: the generic-transformer NER baseline (Phase 4A)

```powershell
cd services/ml
python -m venv .venv
.venv\Scripts\pip.exe install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
```

Then set `ML_SERVICE_PYTHON` in `.env` to the venv's `python.exe` path.
Left empty (the default), the rest of the extraction pipeline still runs
- see `services/ml/README.md` for why this stage is opt-in.

## Using the extraction pipeline

```powershell
# Upload a document (requires a Bearer access token from /auth/login or /auth/register)
curl -X POST http://localhost:4000/documents `
  -H "Authorization: Bearer <accessToken>" `
  -F "documentType=residential_rental" `
  -F "file=@path\to\agreement.pdf"

# Poll status / read results
curl http://localhost:4000/documents/<id> -H "Authorization: Bearer <accessToken>"
curl http://localhost:4000/documents/<id>/entities -H "Authorization: Bearer <accessToken>"
curl http://localhost:4000/documents/<id>/clauses -H "Authorization: Bearer <accessToken>"

# Pipeline correctness sanity check against real synthetic documents
# (NOT a formal evaluation - see docs/architecture/extraction_pipeline.md)
npm run dev:api   # in one terminal
node apps/api/scripts/validate-extraction-sample.mjs 10   # 10 per doc type
```

## Phase 4B: fine-tuning + evaluation

Requires the `services/ml` venv (see above). Uploads all 300 synthetic
documents through the live API first (idempotent - safe to re-run), then
fine-tunes InLegalBERT per StratifiedGroupKFold fold and reports
precision/recall/F1 (mean ± std) for `rule_based`, `generic_transformer`,
and `fine_tuned` side by side. **CPU-only in this environment - a full
5-fold run takes hours; see `docs/architecture/evaluation_results.md`
for the actual configuration and timing used.**

```powershell
npm run dev:api   # in one terminal

# One-time (idempotent): upload + process all 300 synthetic documents
node apps/api/scripts/bulk-upload-synthetic.mjs

# Full 5-fold fine-tune + evaluate (synthetic only; --data-source real
# fails loudly until research/data/real/*/annotated/ has real data)
services/ml/.venv/Scripts/python.exe services/ml/evaluate.py --data-source synthetic

# Recompute metrics from already-persisted predictions without re-training
# (used after fixing a bug found mid-evaluation - see evaluation_results.md)
services/ml/.venv/Scripts/python.exe services/ml/rescore.py

# generic_transformer span-overlap addendum (label-agnostic, IoU>=0.5 -
# see evaluation_results.md's addendum section)
services/ml/.venv/Scripts/python.exe services/ml/score_generic_transformer_overlap.py

# k-fold no-leakage + span-scoring unit tests
services/ml/.venv/Scripts/python.exe -m pytest services/ml/tests
```

## Phase 6: risk engine + adversarial evaluation

The risk engine (`apps/api/src/risk/`) runs automatically as the final
pipeline stage on every uploaded document - `GET /documents/:id/risks`
returns its findings. The commands below regenerate and re-score the
dedicated 150-document adversarial + matched-control test set; see
`docs/architecture/risk_engine.md` (Pass 1/Pass 2 architecture, severity
rubric, evidence design, comparison-check registry) and
`docs/architecture/adversarial_evaluation_results.md` (real detection/
false-positive numbers, including a separate false-positive check against
the ordinary synthetic set) for the write-up these commands reproduce.

```powershell
# Regenerate the 150-document adversarial + matched-control set
# (15 positive + 15 control per category x 5 categories)
python research/generator/generate_adversarial_batch.py --per-category 15 --out research/data/adversarial

npm run dev:api   # in one terminal

# Upload through the live pipeline and tag isAdversarial/isAdversarialControl
cd apps/api
npx dotenv -e ../../.env -- tsx scripts/bulk-upload-adversarial.mjs

# Score detection rate / control FP rate / cross-category FP / evidence
# correctness (categories 2 and 4) from the persisted Risk rows
npx dotenv -e ../../.env -- tsx scripts/evaluate-adversarial.mjs

# Separate false-positive check against the ordinary 300-document
# synthetic set (per the Phase 6 build prompt's addendum - adversarial
# controls alone aren't accepted as the only FP evidence)
npx dotenv -e ../../.env -- tsx scripts/evaluate-ordinary-control-fp.mjs
```

## Phase 7A: knowledge graph + RAG

`GET /documents/:id/graph` returns a document's knowledge graph (built at
read time - see `docs/architecture/knowledge_graph.md`).
`POST /documents/:id/ask` (rate-limited, `{"question": "..."}`) answers
questions grounded strictly in the document's own clauses, with real
provenance and honest refusal - see `docs/architecture/rag_design.md`
(chunking, RetrievalProvider/LLMProvider interfaces, the prompt-injection
defense) and `docs/architecture/rag_evaluation_results.md` (real
retrieval/citation/refusal numbers, plus a separate security section).
**No LLM API key is configured in this environment** - answers are
generated by the verified, non-generative `ExtractiveLLMProvider`
default; see `rag_design.md` for how to activate the implemented-but-
unverified `AnthropicProvider` instead (`LLM_PROVIDER=anthropic` +
`ANTHROPIC_API_KEY` in `.env`). A Phase 7A addendum added preamble-fact
chunking (party names, address, survey number, ...) and investigated
refusal-correctness (finding: structural, not a tunable threshold - see
`rag_design.md`/`rag_evaluation_results.md`'s addendum sections).

```powershell
npm run dev:api   # in one terminal, only needed to hit the endpoints over HTTP
cd apps/api

# Knowledge graph correctness spot-check against real uploaded documents
# (independently recomputes expected edge counts from the source rows)
npx dotenv -e ../../.env -- tsx scripts/evaluate-graph.mjs 450

# RAG quality evaluation: retrieval hit rate, grounded-answer rate,
# citation/evidence correctness, refusal correctness
npx dotenv -e ../../.env -- tsx scripts/evaluate-rag.mjs

# RAG security evaluation: 5 prompt-injection cases, pass/fail (separate
# from the quality metrics above)
npx dotenv -e ../../.env -- tsx scripts/evaluate-rag-security.mjs

# Addendum: refusal-correctness threshold-vs-structural analysis
# (relevance-score tabulation across the full quality test set)
npx dotenv -e ../../.env -- tsx scripts/analyze-refusal-scores.mjs
```

## Phase 7B: legal-intelligence workspace

`npm run dev:web` (after `npm run dev:api` in another terminal) serves the
full workspace at `http://localhost:3000`: register/sign in →
`/documents` (case-file list, upload) → `/documents/:id` (three-zone
workspace - document viewer, left outline/search, right intelligence
panel with Overview/Entities/Clauses/Risks/Graph/Ask tabs).

`GET /documents/summary` is a new, purely-additive endpoint (composes
`Document` + its `ProcessingJob` rows into a per-document
`processingStatus`) the document list uses to avoid an N+1 fetch per row -
see `apps/api/src/routes/documents.ts`. It does not change the shape or
semantics of any existing endpoint.

Design tokens (`apps/web/tailwind.config.ts`), the risk panel's
permanent, non-definitive-language-only notices, and the Ask panel's
mandatory, non-dismissible evidence-status indicator on every answer are
documented in the Phase 7B section of this README's `docs/` links below
and verified by `apps/web`'s own test suite.

```powershell
npm run dev:api    # in one terminal
npm run dev:web    # in another - http://localhost:3000

# Frontend test suite (component tests: highlighting/overlap, risk
# language integrity, mandatory evidence-status indicator, refusal state,
# graph rendering, ownership 403/404 handling, empty/loading/error states)
npm run test --workspace=apps/web
```

## Verifying the setup

```powershell
npm run lint          # ESLint (TypeScript)
npm run format         # Prettier check
npm run typecheck      # tsc --noEmit, strict mode, both apps
ruff check .           # Python lint (research/generator/, services/ml/)
npm run test           # Prisma schema constraint tests, seed integration test,
                        # auth/RBAC tests, document upload/extraction/OCR tests,
                        # rule-based NER/clause classification sanity checks,
                        # risk engine Pass 1/Pass 2 + registry-extensibility +
                        # reason-framing tests (Phase 6), knowledge-graph fixture
                        # tests, chunking determinism, RetrievalProvider/LLMProvider
                        # swappability, /graph + /ask ownership + grounding tests,
                        # prompt-injection defense tests (Phase 7A), and the
                        # apps/web frontend suite - highlighting/overlap, risk
                        # language integrity, mandatory evidence-status indicator,
                        # refusal state, graph rendering, ownership handling,
                        # empty/loading/error states (Phase 7B)
```

`npm run test` requires a running PostgreSQL instance reachable via
`DATABASE_URL` (the same one used for `db:migrate:deploy` above) — the
auth, RBAC, schema-constraint, and extraction-pipeline tests exercise
real database and file-system behavior rather than mocking it, since the
things they're proving (a rejected enum value, a revoked token actually
being rejected on reuse, a scanned page actually being left
`extraction_method: null` until OCR runs) are exactly the things a mock
would hide. The generic-transformer NER test is skipped unless
`ML_SERVICE_PYTHON` is configured (see above) - it reloads a PyTorch
model from disk and would otherwise slow down every test run.

## Database changes

See `docs/architecture/migrations.md` for how migrations are created,
applied, and (manually, since Prisma Migrate has no native down-migration)
rolled back.

## Dataset

`research/data/synthetic/dataset_card.md` documents the synthetic
dataset's provenance and known limitations — read it before writing any
code that consumes this data. In particular: synthetic-only results must
never be reported as evidence of real-world performance (see
`docs/architecture/evaluation_design.md`).

`research/data/adversarial/adversarial_dataset_card.md` documents the
Phase 6 adversarial + matched-control test set the same way — it exists
solely to evaluate the risk engine and must never be used to train or
fine-tune any model.
