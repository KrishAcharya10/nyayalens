# NyayaLens Ultimate Build Specification (placeholder)

The full specification document this repository's build prompt refers to
(the "NyayaLens Ultimate Build Specification", including numbered sections
such as Section 11, 14, 20, 22, 27, 40) was **not provided** when Phase 1-2
was built. This file is a placeholder so `docs/full_spec.md` exists as the
build prompt expects.

## What was actually used to build Phase 1-2

In the absence of the full spec text, Phase 1-2 was built from:

- The Phase 1-2 build prompt itself, which embeds a substantial amount of
  concrete detail (required database tables, `document_type` values, auth
  security requirements, provenance dual-schema, `key_findings` shape,
  RBAC roles, folder layout for real/synthetic/adversarial data).
- The synthetic dataset's `dataset_card.md` and `manifest.jsonl`
  (`research/data/synthetic/`), and the generator source
  (`research/generator/`), which reveal the actual entity/clause label set
  in use (e.g. `LESSOR`, `LESSEE`, `RENT`, `LAND_USE_TYPE`,
  `SURVEY_NUMBER`, `LEASE_DURATION`, `TERMINATION`, `DISPUTE_RESOLUTION`, ...).
- Reasonable, explicitly-flagged engineering defaults where the build
  prompt was silent (tech stack: Next.js + a Node/Express API service,
  PostgreSQL + Prisma, npm workspaces monorepo).

## Sections referenced by the build prompt that could not be resolved

Anywhere this codebase would normally cite a specific numbered section
(e.g. "per spec Section 40" for the monorepo layout, "spec Section 27" for
dataset card provenance format, "spec Section 20" for the full RBAC
model), treat that reference as **unresolved** until the real specification
is pasted into this file. The concrete decisions made instead are recorded
in `docs/architecture/*.md`.

## Action needed

Replace this file's content with the complete NyayaLens Ultimate Build
Specification, then re-check the `docs/architecture/*.md` files for any
decision that should change once the real spec is available (most likely:
the exact entity/clause/risk ontology, the full JSON output schema for
Section 11, and the monorepo layout intended by Section 40).
