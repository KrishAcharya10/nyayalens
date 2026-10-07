# Phase 8, Step 2, Part A — DocumentType / RiskCategory: Enum vs. Free Text

Step 1 flagged that `DocumentType` and `RiskCategory` being fixed Postgres
enums (`packages/db/prisma/schema.prisma:40-45,89-97`) collides with a
data-driven DomainPack registry, and marked the resolution
`VERIFICATION_REQUIRED`. This document resolves it before any migration
code is written.

## Decision: **Option 1 — keep both as Postgres enums; add a migration per new value.**

This is the task's own stated default, and nothing found in this codebase
overrides it. Reasoning specific to this codebase follows.

## Option 1: keep enums, migrate per domain/category

**Migration cost now vs. per future domain.** Zero migrations are needed
for *this* step — rental and land-lease already have their enum values;
Step 2 only reattributes existing logic into packs, it adds no new
`DocumentType` or `RiskCategory` value. Cost is deferred entirely to
whenever Step 3 (the first genuinely new domain) lands, and even then it's
one small, reviewable, additive statement:
`ALTER TYPE document_type ADD VALUE 'property';`. On PostgreSQL 12+ (this
project runs PostgreSQL 16, per the README), adding an enum value is a
fast, non-blocking catalog change — it does not rewrite the table, take a
long lock, or require a maintenance window. The often-cited PostgreSQL
enum restriction (a newly added value can't be used in the same
transaction that added it) was lifted in PG12, so even that friction
doesn't apply here. "Migrate per domain" is a real but genuinely small
cost, not a big one.

**What breaks if the registry and the DB enum drift out of sync.** This is
the deciding factor, and it isn't hypothetical for this codebase — Step 1
already found a live case: `format.ts`'s `formatDocumentType` mismatched a
hypothetical unhandled value with an existing label, silently. Under
Option 1, two independent layers must BOTH accept a value before it can
ever reach a Document row:
1. The TypeScript compiler rejects assigning anything outside the Prisma
   `DocumentType` union anywhere it's type-checked (`RiskEngineContext`,
   route handlers, etc.).
2. The database itself rejects an `INSERT`/`UPDATE` with any value outside
   the enum, regardless of what wrote it — the Express app, a one-off
   script, a future service, a hand-run `psql` command, a restored backup.

A registry that has a pack for a `DocumentType` the enum doesn't (or vice
versa) is a same-day, loud failure under Option 1: the compiler won't
build, or Postgres will reject the write. That is a bug caught at build
time or at the first write attempt — never silently.

**Query efficiency / indexing.** `schema.prisma` already has
`@@index([documentType])` on `Document`. A Postgres enum is stored as a
4-byte value with a fixed internal sort order and compares as fast as any
fixed-width type; a free-text column achieves comparable index lookup
performance via a standard btree index but costs more storage per row
(variable-length text vs. 4 bytes) and provides no compile-time
exhaustiveness checking anywhere the value is switched on. For this
project's scale (a college research project running against a synthetic
+ small real-document corpus), this performance difference is not
material either way — it is not the deciding factor, but it does not
favor Option 2 either.

**Is the "no giant switch statement" goal achievable under Option 1?**
Yes, fully — and this is worth stating plainly because the two axes are
often conflated. The DB column's type constrains *what values can be
persisted*; it says nothing about *how application code branches on the
value it reads back*. The DomainPack registry's whole point (Step 1
design doc §3-§4) is `registry.get(document.documentType)` replacing
`if (documentType === "X")` — and that lookup works identically whether
`documentType` came out of an enum column or a text column, because by
the time application code sees it, it's just a string key either way.
Nothing in Step 2's actual migration (see `docs/phase8/step2_migration_notes.md`)
needed a single new `if (domain === "x")` branch, and the enum stayed in
place throughout. Option 2 buys **no additional progress** toward that
specific goal.

## Option 2: free-text column, validated at the application layer

**Migration cost now vs. per future domain.** Converting the existing
enum column to `text` (`ALTER COLUMN document_type TYPE text USING document_type::text`,
then `DROP TYPE document_type`) is itself a real migration that would have
to happen in *this* step, before any pack work — the opposite of Option
1's "zero cost now." Every future domain then needs zero DB migration,
which is the option's real selling point.

**What breaks if the registry and stored data drift.** This is the
concrete downside, and it's a strictly worse version of the exact failure
mode Step 1 already caught once. Under Option 2, nothing at the database
level stops a row from holding a `documentType` value that no currently
registered pack recognizes — a leftover row from before a pack was
deregistered, a hand-run backfill script with a typo, a restored backup
taken under an older app version, a second process (a worker, a future
admin tool) that writes `Document` rows without going through the same
validation path as the Express API. Every one of those produces a row
that is silently unrepresentable by the running application, discovered
only whenever something finally tries to render or process it — the same
shape of bug as the `formatDocumentType` ternary, except now it can also
happen from *outside* the TypeScript compiler's reach entirely, since
there is no longer a DB-level backstop at all. Approximating the enum's
guarantee with a `CHECK` constraint would mean re-encoding the same fixed
value list Option 2 was chosen to avoid, at which point it offers strictly
less safety than Option 1 for the same closed-set intent.

**Query efficiency / indexing.** As above — roughly comparable at this
project's scale, slight edge to Option 1 on storage and compile-time
exhaustiveness, not a deciding factor for either.

**"No giant switch statement" achievability.** Identical to Option 1 —
this axis simply doesn't move based on the column's DB type, per the
reasoning above.

## Why not default away from Option 1 for `RiskCategory` specifically

The same reasoning applies, arguably with higher stakes: a `RiskCategory`
value the registry doesn't recognize would surface as a risk finding the
UI can't correctly label or explain to a user relying on it for a legal
decision — a worse outcome than a mislabeled document-type chip. Keeping
`RiskCategory` a Postgres enum too, migrated per new category the same
way, is consistent and equally justified.

## Recommended mitigation (not a schema change)

Since Option 1 depends on the registry and the two Postgres enums being
kept in sync *by a human remembering to update both*, add a cheap,
automated check that fails loudly the moment they drift, rather than
relying on discipline alone: a test (or a startup assertion in the API
process) that asserts every `DomainPack.documentTypes[].id` registered in
`getDomainPackRegistry()` is a valid Prisma `DocumentType` enum value, and
vice versa. This is a small, additive safety net that turns "someone
forgot to add the enum migration when they added a pack" into an
immediate, loud, same-PR test failure instead of a runtime surprise
later. This is recommended for Step 3 (when a real second value is added
to prove the check actually exercises both directions) rather than
implemented speculatively in this step.

## Consequence for Step 2

`DocumentType` and `RiskCategory` remain exactly as they are in
`schema.prisma` — no migration is created in this step. The DomainPack
registry's `DocumentTypeDescriptor.id` values (`"RESIDENTIAL_RENTAL"`,
`"LAND_LEASE"`) are chosen to equal the existing enum's values exactly,
and `RiskEngineContext.documentType` is widened from the Prisma
`DocumentType` type to a plain `string` in application code only (matching
the precedent already set by `graph/types.ts`'s `BuildGraphInput.documentType: string`)
— a type-level change in how already-validated values are carried through
the pipeline, not a schema change, and not in tension with keeping the
column itself an enum.
