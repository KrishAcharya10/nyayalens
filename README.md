# NyayaLens

Indian legal document intelligence platform. Converts residential rental
agreements and land lease deeds into structured, evidence-grounded
information — entities, clauses, relations, risks, and (eventually) a
knowledge graph, with every extracted fact carrying provenance back to
its source document.

**This repository currently implements Phase 1-2 only: repository
scaffolding, the database schema, and authentication.** No document
upload, text extraction, OCR, NER, clause classification, relation
extraction, embeddings, RAG, knowledge graph, or risk detection exists
yet — see `docs/architecture/*.md` for what's reserved-but-unimplemented
and why.

Commercial leases and general contracts are explicitly out of scope for
this project.

## Repository layout

```
apps/
  web/      Next.js frontend (login/register pages calling the API)
  api/      Node/Express + TypeScript API (auth, RBAC)
packages/
  db/       Prisma schema, migrations, seed script, shared DB client
research/
  data/
    synthetic/   300 synthetic documents (150 residential rental, 150 land lease)
    real/        Empty - real documents (target 15+15) not yet collected
    adversarial/ Empty - adversarial risk-engine test cases, later phase
  generator/     Python source that generated the synthetic dataset
docs/
  full_spec.md            Placeholder - see note inside
  architecture/           Design docs (database, auth, migrations, provenance, schema, evaluation)
  research/                Adversarial test case design
```

## Prerequisites

- Node.js >= 20 and npm >= 10
- Docker (for local PostgreSQL via `docker-compose.yml`) **or** a
  PostgreSQL 16 instance you already have running
- Python 3.10+ only if you intend to (re)run the synthetic dataset
  generator in `research/generator/` — not required to run the app

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

## Verifying the setup

```powershell
npm run lint          # ESLint (TypeScript)
npm run format         # Prettier check
npm run typecheck      # tsc --noEmit, strict mode, both apps
ruff check .           # Python lint (research/generator/)
npm run test           # Prisma schema constraint tests, seed integration test, auth/RBAC tests
```

`npm run test` requires a running PostgreSQL instance reachable via
`DATABASE_URL` (the same one used for `db:migrate:deploy` above) — the
auth, RBAC, and schema-constraint tests exercise real database behavior
rather than mocking it, since the things they're proving (a rejected
enum value, a revoked token actually being rejected on reuse) are exactly
the things a mock would hide.

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
