# Local setup

NyayaLens runs entirely on one machine. Nothing in the default
configuration calls a cloud API: OCR, extraction, risk analysis, Q&A and
evaluation are all local. This guide covers the full setup, from a fresh
clone to a running workspace, plus the optional local components.

## 1. Requirements

| Component | Version | Needed for |
| --- | --- | --- |
| Node.js | 20+ (npm 10+) | API, web app, tests |
| Docker | any recent | PostgreSQL 16 (or bring your own Postgres 16) |
| Python | 3.10+ | Optional: transformer NER baseline, dataset generator |
| Ollama | any recent | Optional: local generative answers |

## 2. Core install (required)

```bash
npm install                      # all workspaces
cp .env.example .env             # then set the two JWT secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # run twice

docker compose up -d postgres    # PostgreSQL 16 on localhost:5432
npm run db:generate              # Prisma client
npm run db:migrate:deploy        # all migrations, including Phase 8's
npm run db:seed                  # optional demo data

npm run dev:api                  # http://localhost:4000
npm run dev:web                  # http://localhost:3000
```

Open http://localhost:3000, register, and upload a PDF or DOCX. Pick the
document type at upload. The list comes from the API's DomainPack registry
(`GET /domain-packs`), covering seven domains and thirteen document types.

### What is local by default

- **Fonts.** Bundled through `@fontsource` packages, so no Google Fonts
  requests are made.
- **OCR.** tesseract.js with the English model from
  `@tesseract.js-data/eng`, an npm dependency. Nothing is downloaded at
  runtime.
- **Extraction, semantic layer, risk and consistency engines, domain
  detection, knowledge graph.** All of these are deterministic TypeScript in
  `apps/api`.
- **Q&A.**
  - Structured answers come from the document's own extracted facts.
  - The retrieval fallback uses BM25 with an extractive answer
    (`LLM_PROVIDER="extractive"`, the default).

## 3. Optional: transformer NER baseline (local, offline after one download)

```powershell
cd services/ml
python -m venv .venv
.venv\Scripts\pip.exe install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
.venv\Scripts\python.exe download_models.py    # one-time model download into the HF cache
```

Set `ML_SERVICE_PYTHON` in `.env` to the venv's `python.exe`. The API runs
the baseline with `HF_HUB_OFFLINE=1`, so after the one-time download it
never contacts the network. If `ML_SERVICE_PYTHON` is left empty, that
pipeline stage is skipped and every other stage still runs.

## 4. Optional: local generative answers with Ollama

```bash
ollama pull qwen2.5:3b
```

Then set `LLM_PROVIDER="ollama"` in `.env`. The other settings are
`OLLAMA_BASE_URL`, `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS`.

- Ollama only phrases answers from retrieved evidence.
- Fact questions are still answered from extracted facts first.
- If the Ollama server is not running, each question falls back to the
  extractive provider and logs a warning.

## 5. Optional: synthetic dataset v3 and evaluation

The generator is pure Python with no network access:

```powershell
cd research/generator
python -m venv .venv
.venv\Scripts\pip.exe install -r requirements.txt
.venv\Scripts\python.exe generate_v3.py --seed 2027 --write-card   # reproduces the reported dataset
.venv\Scripts\python.exe -m pytest tests -q
```

- **Output.** `research/data/synthetic_v3/` (git-ignored, about 3,640
  documents as JSON/TXT/DOCX/PDF), plus
  `research/data/reports/dataset_quality.json`.
- **Ontology.** The generator reads the ontology from
  `research/generator/v3/ontology.json`, which is exported from the
  TypeScript DomainPacks. After changing a pack, re-export it with
  `npm run export:ontology --workspace=apps/api`; a test fails if the
  export is stale.

Run the evaluation harness (the same code as the pipeline, in memory):

```bash
cd apps/api
npx tsx scripts/evaluate-v3.mjs            # writes research/eval_results/v3_evaluation.json and docs/evaluation.md
npx tsx scripts/evaluate-v3.mjs --data <other dataset dir>   # development run; docs/evaluation.md untouched
```

The public `/research` page in the web app reads both result files. If a
file is missing, the page says so instead of showing placeholder numbers.

## 6. Tests and checks

```bash
npm test                 # packages/db, apps/api (needs Postgres running), apps/web
npm run typecheck
npm run lint
npm run format           # prettier --check
cd services/ml && .venv\Scripts\python.exe -m pytest -q
cd research/generator && .venv\Scripts\python.exe -m pytest tests -q
```

## 7. Troubleshooting

- **`Invalid environment configuration`.** Tests and scripts that touch the
  database need `.env`. Run them through the npm scripts, which wrap them
  with `dotenv -e ../../.env`.
- **A new document type is rejected at upload.** Run
  `npm run db:migrate:deploy`. Each Phase 8 document type is a Postgres
  enum value added by a migration.
- **Obligations or Consistency tabs are empty on an old document.** Those
  stages were added in Phase 8, and documents processed earlier have no
  rows for them. Re-upload the document to run the full pipeline.
