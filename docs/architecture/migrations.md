# Migrations

## How migrations are created and applied

- Schema source of truth: `packages/db/prisma/schema.prisma`.
- Local development: `npm run db:migrate` (→ `prisma migrate dev` inside
  `packages/db`). This diffs the schema against the target database,
  writes a new timestamped folder under `packages/db/prisma/migrations/`,
  applies it, and regenerates the Prisma Client.
- Deploying to an existing database (staging/production, or CI): `npm run
  db:migrate:deploy` (→ `prisma migrate deploy`), which applies any
  migrations not yet recorded in the database's `_prisma_migrations`
  table and never prompts or generates a new migration.
- Every migration must apply cleanly to a **fresh** database — this is
  how `prisma migrate deploy` is verified in this repo's setup
  instructions (`README.md`): a brand-new `docker compose up -d postgres`
  volume, then `npm run db:migrate:deploy` with zero manual steps.

## Rollback: Prisma Migrate does not generate reversible down-migrations

**Prisma Migrate does not natively support "down" migrations.** There is
no `prisma migrate down` command, and none is assumed or invented
anywhere in this repo's scripts or documentation. If a migration needs to
be rolled back, use one of the following manual, tested procedures —
choose based on environment:

### Procedure A — local development / a fresh environment with disposable data

Safe whenever the database only holds seed/synthetic/test data (i.e. any
local dev environment following this repo's default setup):

1. `docker compose down -v` (drops the Postgres volume entirely — this
   discards ALL data in that container, which is fine only because it's
   local dev data).
2. `docker compose up -d postgres`
3. Fix the schema/migration issue in `packages/db/prisma/schema.prisma`.
4. `npm run db:migrate` to regenerate a corrected migration from scratch.
5. `npm run db:seed` to restore synthetic seed data.

### Procedure B — an environment with real data that must be preserved (staging/production)

Prisma Migrate has no concept of "undo the last migration" once real data
exists, so this is a **restore-from-backup** procedure, not a migration
rollback:

1. Stop write traffic to the database (take the API out of rotation, or
   put it in maintenance mode).
2. Restore the most recent pre-migration backup
   (`pg_restore`/`pg_dump` — a backup/restore cadence and tooling is a
   deployment concern for a later phase; not established yet in Phase 1-2).
3. Manually delete the offending migration's row from the
   `_prisma_migrations` table in the restored database if it was recorded
   there, so `prisma migrate deploy` doesn't think it's already applied.
4. Fix the schema, write a **new forward migration** that corrects the
   issue (do not try to hand-edit an already-applied migration file —
   Prisma detects and rejects a modified applied migration's checksum by
   default), and deploy that instead.

### Why a forward-only fix is preferred to a hand-written down-SQL script

For a migration that has **not yet touched production data** (e.g. it
only failed in CI or a fresh review environment), the simplest and safest
"rollback" is Procedure A: throw the migration away and regenerate it
correctly — there is no data to lose. A hand-maintained down-SQL script
per migration was considered and rejected for this project: keeping such
scripts correct and tested as the schema evolves is itself a source of
bugs, and Prisma's own documentation recommends the restore-from-backup
approach for production rather than relying on down-scripts. If a
specific migration is later judged risky enough to warrant a bespoke,
tested down-SQL script anyway, add it as
`packages/db/prisma/migrations/<timestamp>_<name>/down.sql` (not a Prisma
concept — a plain SQL file next to `migration.sql`, applied manually) and
document that decision here.

## Testing migrations apply cleanly

`README.md`'s setup steps include running `db:migrate:deploy` against a
freshly created `docker compose` Postgres volume with no prior state, as
the concrete verification that "migrations apply cleanly to a fresh
database."
