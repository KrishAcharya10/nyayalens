# NyayaLens

Indian legal document intelligence platform. Converts residential rental
agreements and land lease deeds into structured, evidence-grounded
information — entities, clauses, relations, risks, and (eventually) a
knowledge graph, with every extracted fact carrying provenance back to
its source document.

**This repository currently implements Phase 1-4B**: repository
scaffolding, the database schema, authentication (Phase 1-2); document
upload, storage, and canonical-text extraction (Phase 3); OCR, rule-based
NER, a generic-transformer NER baseline, and rule-based clause
classification (Phase 4A); InLegalBERT fine-tuning and StratifiedGroupKFold
evaluation across all three model sources (Phase 4B — real, measured
results in `docs/architecture/evaluation_results.md`, synthetic-only).
Relation extraction, embeddings, RAG, knowledge graph, and risk detection
do not exist yet — see `docs/architecture/*.md` for what's
reserved-but-unimplemented and why.

Commercial leases and general contracts are explicitly out of scope for
this project.

## Repository layout

```
apps/
  web/      Next.js frontend (login/register pages calling the API)
  api/      Node/Express + TypeScript API (auth, RBAC, upload, extraction pipeline)
    src/storage/      Local-disk storage adapter (swappable interface)
    src/extraction/   PDF/DOCX canonical text extraction
    src/ocr/          PDF page rasterization + Tesseract OCR
    src/ner/          Rule-based NER + generic-transformer NER subprocess call
    src/clauses/      Rule-based clause segmentation/classification
    src/jobs/         In-process async pipeline (queue, stages, startup recovery)
    scripts/          validate-extraction-sample.mjs (Phase 4A pipeline sanity check)
packages/
  db/       Prisma schema, migrations, seed script, shared DB client
services/
  ml/       Python: generic-transformer NER baseline, (Phase 4B) fine-tuning + evaluation
research/
  data/
    synthetic/   300 synthetic documents (150 residential rental, 150 land lease)
    real/        Empty - real documents (target 15+15) not yet collected
    adversarial/ Empty - adversarial risk-engine test cases, later phase
  generator/     Python source that generated the synthetic dataset
docs/
  full_spec.md            Placeholder - see note inside
  architecture/           Design docs (database, auth, migrations, provenance, schema,
                           evaluation_design, document_ingestion, extraction_pipeline,
                           evaluation_results - the real Phase 4B numbers)
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

## Verifying the setup

```powershell
npm run lint          # ESLint (TypeScript)
npm run format         # Prettier check
npm run typecheck      # tsc --noEmit, strict mode, both apps
ruff check .           # Python lint (research/generator/, services/ml/)
npm run test           # Prisma schema constraint tests, seed integration test,
                        # auth/RBAC tests, document upload/extraction/OCR tests,
                        # rule-based NER/clause classification sanity checks
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
