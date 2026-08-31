# Phase 7A: knowledge graph

A relational representation of a document's entities/clauses/risks,
queried graph-style - not a separate graph database. Built at **read
time** from already-persisted `entities`/`document_clauses`/`risks` rows,
not materialized or kept separately in sync.

## Why relational, not a graph database

Postgres already holds every fact the graph exposes, with foreign keys
back to `document_id` on every table. A document's graph is small (single
digits to low tens of nodes/edges - one document's clauses and entities,
not a cross-document corpus), so building it fresh per request
(`apps/api/src/graph/loadDocumentGraph.ts`, three `Promise.all`'d
queries + a pure in-memory join) costs nothing worth optimizing away.
Introducing a dedicated graph database would add a new piece of
infrastructure, a new sync problem (nodes/edges going stale relative to
their source rows), and a new failure mode, for no query this phase
actually needs to run that Postgres can't already answer directly. If a
future phase needs cross-document graph queries at a scale where
read-time joins become slow, that's the point to revisit this - not
before.

## Node types

| Type | One per | `label` | `text`/offsets |
|---|---|---|---|
| `DOCUMENT` | the document itself | `documentType` | none |
| `ENTITY` | persisted `Entity` row | entity `label` (e.g. `RENT`) | entity text + offsets |
| `CLAUSE` | persisted `DocumentClause` row | `clauseType` (e.g. `RENT_PAYMENT`) | clause text + offsets |
| `RISK_FINDING` | persisted `Risk` row | risk `category` | none (see evidence below) |

Node ids are namespaced by type (`document:<id>`, `entity:<id>`,
`clause:<id>`, `risk:<id>`) so the same underlying row id can never be
ambiguous across node types in the serialized graph.

## Edge types

| Type | From -> To | Built from |
|---|---|---|
| `HAS_ENTITY` | `DOCUMENT` -> `ENTITY` | every persisted entity for this `(documentId, modelSource)` |
| `HAS_CLAUSE` | `DOCUMENT` -> `CLAUSE` | every persisted clause for this `(documentId, modelSource)` |
| `REFERENCES` | `CLAUSE` -> `ENTITY` | co-location rule below |
| `FLAGS` | `RISK_FINDING` -> `CLAUSE`\|`ENTITY` | one edge per element of the risk's `evidence` array (Phase 6) |
| `COMPARED_WITH` | `CLAUSE` <-> `CLAUSE` | every pair of clause-sourced evidence spans on the same finding |

### `REFERENCES` co-location rule

A clause "contains" an entity when the entity's `[textStart, textEnd)`
span falls **entirely within** the clause's `[textStart, textEnd)` span,
and both spans are known (non-null) offsets into the same
`canonical_text` (`entityWithinClause` in `buildGraph.ts`). Both offsets
must be populated for the check to run at all - this only ever compares
offsets produced by the same extraction path (see
`docs/architecture/provenance.md`'s warning against mixing canonical-text
and visual/page provenance), which is guaranteed here since both come
from the same `model_source`-filtered query.

### `FLAGS` and `COMPARED_WITH`

Phase 6's `Risk.evidence` is already an array of `{sourceTable,
sourceId, ...}` elements - one per clause/entity a finding is anchored
to (a Pass 1 finding always has exactly one; a Pass 2 finding has two or
more). `FLAGS` turns every element into an edge from the risk node to the
clause/entity node it names. `COMPARED_WITH` additionally connects every
**pair** of clause-sourced evidence elements on the same finding - in
practice this only ever fires for `ASYMMETRIC_OBLIGATION` (both
compared `NOTICE_PERIOD` clauses are clause-sourced), never for
`LAND_USE_CONTRADICTION` (one entity-sourced + one clause-sourced
element - only one clause, nothing to pair it with) or any Pass 1
category (exactly one evidence element). This generalizes to a
hypothetical future check with three or more clause-sourced spans
without any code change - every pairwise combination gets its own edge.

An evidence element naming a clause/entity id that isn't in this
document's own (model-source-filtered) clause/entity set is silently
skipped rather than producing a dangling edge - this shouldn't happen in
practice (evidence is always written by the same risk-engine run that
reads the clauses/entities), but the builder doesn't assume it can't.

## API

`GET /documents/:id/graph` - ownership-scoped via the same
`findOwnedDocumentId` helper every other `:id`-scoped route uses,
`?model_source=` optional (default `RULE_BASED`, one of `RULE_BASED` /
`GENERIC_TRANSFORMER` / `FINE_TUNED` - explicit, never an implicit
assumption, same discipline as Phase 6's `runRiskEngine`). Returns
`{ graph: { documentId, modelSource, nodes, edges } }`.

No structured "entities referenced by clause X"-style query endpoints
were added beyond this - the full graph for a document is small enough
that a client can filter it client-side, and adding narrower endpoints
without a concrete consumer needing them would be speculative surface
area this phase's own scope note warns against ("not over-engineered").

## Correctness verification

Two layers, per the build prompt's "assertable programmatically, not
just eyeballed" requirement:

1. **Unit tests against hand-built fixtures**
   (`apps/api/tests/graphBuilder.test.ts`) - exact expected node/edge
   lists for known inputs, including the co-location boundary (an entity
   just outside a clause's span gets no `REFERENCES` edge), the
   `COMPARED_WITH` pairing rule, and a dangling-evidence-id case.
2. **A spot-check script against real, already-uploaded synthetic
   documents** (`apps/api/scripts/evaluate-graph.mjs`) -
   independently recomputes the expected `HAS_CLAUSE`/`HAS_ENTITY`/
   `REFERENCES`/`FLAGS` edge counts directly from the same Postgres rows
   the graph was built from (not by re-running `buildDocumentGraph` -
   that would just prove the function is consistent with itself, not
   that its output matches the source data), and asserts an exact match.
   Run against all 450 available real documents (300 ordinary synthetic
   + 150 adversarial): **450/450 exact matches, 0 mismatches** - see
   `rag_evaluation_results.md`'s companion numbers for the RAG side of
   Phase 7A's evaluation.

## What Phase 7B will need from this

`GET /documents/:id/graph`'s JSON shape (`nodes`/`edges` with typed,
namespaced ids) is designed to be visualization-library-agnostic - Phase
7B's graph visualization component can consume it directly without a
reshaping step, as long as it doesn't assume anything about node/edge
ordering (none is guaranteed).
