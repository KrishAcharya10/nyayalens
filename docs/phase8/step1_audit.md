# Phase 8, Step 1 — Domain-Coupling Audit

Read-only audit of how "residential rental" vs "land lease" domain logic
currently lives in the codebase, as of Phase 7B (commit `12daec2`). No code
was changed to produce this document. File:line references point at the
lines read during this audit; re-check them if the surrounding file has
since moved.

The short version: **the extraction/graph/RAG pipeline stages are almost
entirely domain-agnostic already** — they operate on flat, undifferentiated
ontologies that happen to cover both domains at once, scoped only by which
regex patterns match a given document's actual vocabulary. The **risk
engine** is where explicit `documentType` branching lives. The **database
schema** and the **frontend** are where the "exactly two domains" assumption
is hardest, because both encode it as closed, literal two-value unions
(a Postgres enum in one case, a TypeScript union type in the other).

---

## 1. Ingestion (upload)

**`apps/api/src/routes/documents.ts`**
- Line 35: `documentType: z.enum(["residential_rental", "land_lease"])` — the
  upload request body schema is validated against a hardcoded two-value
  enum. A third domain requires editing this Zod schema.
- Lines 157–158: the validated lowercase string is mapped by hand to the
  Prisma enum value (`"residential_rental" -> "RESIDENTIAL_RENTAL"`, else
  `"LAND_LEASE"`) via a ternary — not a lookup table, so a third value falls
  through to `LAND_LEASE` silently rather than erroring. This is a latent
  bug pattern (see also §5, `formatDocumentType` on the frontend, which has
  the identical shape).
- The rest of the file (list/detail/summary routes) just passes
  `documentType` through from the DB; no further branching.

**Database — `packages/db/prisma/schema.prisma`**
- Lines 38–45: `enum DocumentType { RESIDENTIAL_RENTAL, LAND_LEASE }`, with
  an explicit comment: *"Restricted to the two document types NyayaLens
  supports."* This is a **Postgres enum column**, not app-level config —
  the single hardest coupling point to abstract away in pure TypeScript.
  Adding a domain requires a schema migration (`ALTER TYPE ... ADD VALUE`),
  regardless of how well-designed the registry above it is.
- Lines 89–97: `enum RiskCategory` is likewise a fixed 5-value Postgres
  enum. A domain that needs a 6th risk category (or that doesn't use one of
  the existing 5) hits the same migration requirement. This directly
  matters for `DomainPack.risk_schema` (Part B) — see §7 below.
- By contrast, `DocumentClause.clauseType` (line 259) and `Entity.label`
  (line 294) are **free-text `String` columns**, not enums — already
  data-driven at the schema level. Adding new clause/entity types for a new
  domain needs zero schema migration today.

---

## 2. NER (`apps/api/src/ner/`)

**`rulePatterns.ts`** — no `documentType` branching at all.
- `STANDALONE_PATTERNS` (lines 29–110) is **one flat array** mixing
  rental-only entities (`LANDLORD`, `TENANT`) and land-lease-only entities
  (`LESSOR`, `LESSEE`, `SURVEY_NUMBER`, `LAND_AREA`, `LAND_USE_TYPE`,
  `KHATA_NUMBER`, `EASEMENT_RIGHT`) in a single ordered list, run
  unconditionally over every document's full text regardless of its
  `documentType`.
- `AMOUNT_KEYWORDS` (lines 128–132) is the same shape: `SECURITY_DEPOSIT` /
  `LEASE_PREMIUM` / `RENT` keyword-window rules all live in one list and
  all run on every document.
- In effect, domain scoping today is **implicit and vocabulary-driven**: a
  residential rental document simply never contains the string "Survey
  No." or "LESSOR:", so those patterns never fire — not because anything
  checks `documentType`. This works only as long as the two domains'
  surface vocabularies don't collide. A third domain sharing a keyword
  (e.g. another domain that also uses the word "premium" or "deposit" for
  something else) would silently mislabel entities, because
  `AMOUNT_KEYWORDS` has no per-domain isolation.
- `genericTransformerNer.ts` (lines 1–65) has zero domain-specific logic —
  it shells out to a stock pretrained model and prefixes labels `GENERIC_`
  (per its own header comment); genuinely domain-agnostic already.

---

## 3. Clause classification (`apps/api/src/clauses/`)

**`clauseTaxonomy.ts`**
- Lines 21–34: `CLAUSE_TAXONOMY` is **one flat, order-sensitive array**
  mixing rental-only types (`SECURITY_DEPOSIT`, `RENT_PAYMENT`) and
  land-lease-only types (`LEASE_PREMIUM`, `LAND_USE_RESTRICTION`,
  `CROP_OR_CULTIVATION_RIGHTS`, `ENCUMBRANCE_DECLARATION`). The file's own
  header comment states order is load-bearing: "a heading is tested
  against these in order and the first match wins, so more specific
  patterns are listed first (e.g. LEASE_PREMIUM's 'PREMIUM' before
  RENT_PAYMENT's 'RENT')." Any new domain's clause types must be spliced
  into this exact ordering with manual attention to heading-pattern
  collisions with the other domain(s) already in the list.
- `classifyHeading()` (lines 36–39) has no `documentType` parameter —
  it classifies from the taxonomy list alone, unconditionally.

**`ruleBasedClauseClassifier.ts`** — no domain branching; calls
`segmentClauses` then `classifyHeading` per segment, skipping anything
unrecognized (line 25 comment: "skip rather than fabricate a label").

**`clauseSegmenter.ts`**
- Line 15: `HEADING_PATTERN = /^(\d{1,2})\.\s+([A-Z][A-Z /&,-]{2,60})\s*$/gm`
  is domain-agnostic (numbered, all-caps headings) but tightly coupled to
  the *synthetic generator's* exact formatting convention — the file's own
  header comment already flags this as "a real limitation, not just a
  baseline simplification." This affects every domain equally; it is not
  a rental-vs-land-lease coupling, but it will affect any new domain's
  documents that don't follow this exact heading style (lowercase
  headings, "Clause 1:", roman numerals, etc.).

---

## 4. Risk engine — Pass 1 (`apps/api/src/risk/pass1PerClause.ts`)

This file has the **most explicit, most literal** domain coupling in the
codebase.

- Lines 10–41, `detectLiabilityShift`: the header comment states this
  check is "residential_rental only," but the function itself never reads
  `context.documentType` — it only fires on a `MAINTENANCE` clause, which
  land-lease documents in this dataset never have. Domain scoping here is
  **implicit** (same pattern as NER/clause taxonomy): correct only because
  of what the two domains' documents currently contain.
- Lines 43–71, `detectUnboundedDiscretion`: identically shaped — implicitly
  residential-only via `SECURITY_DEPOSIT` clause presence, no explicit
  `documentType` check.
- **Lines 78–96**, `EXPECTED_CLAUSE_TYPES`:
  ```ts
  const EXPECTED_CLAUSE_TYPES: Record<"RESIDENTIAL_RENTAL" | "LAND_LEASE", string[]> = { ... }
  ```
  This is the one **explicit, compiler-enforced two-value branch** in the
  entire pipeline — the object's type literally is the two `DocumentType`
  enum values. Adding a third domain means widening this `Record`'s key
  type (and therefore also widening the Prisma `DocumentType` enum, per
  §1). This is the single riskiest, most direct coupling point to migrate.
- Lines 98–111, `MISSING_CLAUSE_SEVERITY`: a flat clause-type → severity
  map, not domain-keyed — hardcoded in code but at least not literally
  typed against the two-domain enum.
- Line 114, `detectMissingClauses`: does the `EXPECTED_CLAUSE_TYPES[context.documentType]`
  lookup directly.

## 4b. Risk engine — Pass 2 (`apps/api/src/risk/pass2CrossClause.ts`)

- Lines 1–10 (file header): explicitly documents that new checks are meant
  to be added to `COMPARISON_CHECKS` "without touching pass1PerClause.ts or
  anything else in this file" — this registry-of-checks shape (line
  161–164, `ComparisonCheck { name, run(context) }`) is **already the right
  extensibility pattern** for a DomainPack's risk rules to plug into. A
  dedicated test (`apps/api/tests/riskEnginePass2.test.ts:171`, "Pass 2
  registry extensibility") proves a throwaway check can be registered and
  run standalone — this is real, tested extensibility, not just a
  comment's claim.
- Line 29, `PARTY_TAG_PATTERN = /[(-]\s*(LANDLORD|TENANT|LESSOR|LESSEE)\b/i`:
  hardcodes **both current domains' party-role vocabulary in one shared
  regex**, inside `asymmetricObligationCheck` (lines 61–107), which itself
  has no explicit `documentType` branch — it's domain-agnostic by
  construction (works for any two-party document as long as the role names
  match this pattern). A third domain with different role names (e.g.
  `LICENSOR`/`LICENSEE`) requires editing this shared pattern rather than
  being purely additive — a real coupling, but a narrower one than
  `EXPECTED_CLAUSE_TYPES`.
- **Line 123**, `landUseContradictionCheck`:
  ```ts
  if (context.documentType !== "LAND_LEASE") return [];
  ```
  The second explicit, literal `documentType` branch in the codebase.
  There is a regression test pinned directly to this line's behavior:
  `apps/api/tests/riskEnginePass2.test.ts:147`, *"never runs the land-use
  check for residential_rental documents."* Any future migration that
  moves this check behind a DomainPack must preserve this exact behavior,
  or this specific test needs a deliberate, reviewed update (deferred to
  Step 2 — not done here).

## 4c. Risk engine orchestration (`runRiskEngine.ts`, `types.ts`)

- `runRiskEngine.ts` fetches `document.documentType` from the DB and
  threads it into `RiskEngineContext` — pure plumbing, no branching of its
  own.
- `types.ts` line 25: `RiskEngineContext.documentType: DocumentType` is
  typed directly against the **Prisma-generated enum type**, so every
  pipeline function that touches this context is nominally coupled to
  the two-value DB enum at the type level, even where (as in most of Pass
  1/2) the value is never actually branched on.

---

## 5. Knowledge graph (`apps/api/src/graph/`)

**`buildGraph.ts`** — fully domain-agnostic. No `documentType` branching
anywhere; `input.documentType` (line 51) is used only cosmetically, as the
`DOCUMENT` node's display label. Generic node/edge construction from
whatever clauses/entities/risks are passed in. **This stage needs no
changes at all to support a new domain** — it already treats the ontology
as arbitrary data.

`graph/types.ts` mirrors this: `documentType: string` (line 67) — already
a plain string, not the Prisma enum. Genuinely domain-agnostic today.

---

## 6. RAG (`apps/api/src/rag/`)

**`chunking.ts`** — domain-agnostic logic (chunk-per-clause plus
chunk-per-uncontained-entity), but:
- Lines 58–67, `ENTITY_DISPLAY_NAME`: a flat hardcoded map from entity
  label to human-readable display name, mixing both domains' entity
  vocabulary (`LANDLORD`, `TENANT`, `LESSOR`, `LESSEE`, `ADDRESS`,
  `SURVEY_NUMBER`, `LAND_AREA`, `LAND_USE_TYPE`). It already degrades
  gracefully for anything not listed (`humanizeLabel`, lines 69–77, falls
  back to a generic humanization) — so a new domain's entities work
  without this map being touched, they just won't get a curated display
  name until someone adds one.

**`systemInstructions.ts`, `bm25Retriever.ts`, `llmProviderFactory.ts`,
`runAsk.ts`** — no `documentType` or domain-specific logic found anywhere
in these files. Fully generic already.

---

## 7. Frontend (`apps/web/src/`)

This is where the "exactly two domains" assumption is most rigid, because
it's expressed as closed TypeScript union types plus hand-written JSX, not
data:

- **`components/documents/UploadDocumentForm.tsx`**
  - Line 9: `useState<"residential_rental" | "land_lease">(...)`
  - Line 54: the `onChange` handler's cast is the same two-value union.
  - Lines 57–58: exactly two hardcoded `<option>` elements in the
    `<select>`. A third domain requires editing this component's type
    *and* its JSX by hand — there is no data-driven list this renders
    from.
- **`lib/apiTypes.ts`**, line 8:
  `export type DocumentType = "RESIDENTIAL_RENTAL" | "LAND_LEASE";` — a
  hand-mirrored two-value union, used throughout `DocumentSummary` and
  `DocumentDetail`.
- **`lib/format.ts`**, lines 16–18:
  ```ts
  export function formatDocumentType(type: "RESIDENTIAL_RENTAL" | "LAND_LEASE"): string {
    return type === "RESIDENTIAL_RENTAL" ? "Residential Rental" : "Land Lease";
  }
  ```
  A hardcoded ternary with the identical latent-bug shape as
  `routes/documents.ts` lines 157–158: if the underlying union is ever
  widened to a third value without updating this function, that value
  silently displays as **"Land Lease"** rather than erroring or showing
  its own name. Flagging this explicitly since it's an easy one to miss
  when migrating.
- All other workspace components inspected (`RiskPanel.tsx`, `ClauseTab.tsx`,
  `EntityTab.tsx`, `GraphView.tsx`, `AskPanel.tsx`, `DocumentViewer.tsx`)
  render generically off whatever clauses/entities/risks/graph data the API
  returns — no per-`documentType` branching found in any of them. The
  workspace UI is, structurally, already domain-agnostic apart from the
  three points above.

---

## 8. Dataset generator (`research/generator/*.py`) — out of scope, noted only

Per the task constraints, the synthetic dataset is not to be touched in
this step, and this audit did not exhaustively trace `value_pools.py` /
`adversarial_generator.py`. Noting for later-phase awareness only:
`generator.py`'s `BuiltDocument.document_type` (a free Python string,
`"residential_rental"` or `"land_lease"`) drives per-domain generation
branching entirely on the Python side, decoupled from the TypeScript
pipeline. A future `DomainPack.generator_config` (per the Part B interface
sketch) would need its own design pass against this Python code — deferred
explicitly, see §"Deferred / TODO" in the report-back below.

---

## 9. Test coverage — what "no regressions" means for a later migration

- **Unit tests, pure functions** (`ruleBasedNer.test.ts`,
  `ruleBasedClauseClassifier.test.ts`, `riskEnginePass1.test.ts`,
  `riskEnginePass2.test.ts`, `graphBuilder.test.ts`, `chunking.test.ts`,
  `reasonFraming.test.ts`, `retrievalProvider.test.ts`, `llmProvider.test.ts`)
  — these construct `RiskEngineContext`/`BuildGraphInput`/chunk inputs by
  hand and assert on function output directly. They are the fastest,
  most precise regression net for any future migration of Pass 1/Pass 2
  logic into pack-driven config — in particular:
  - `riskEnginePass1.test.ts` builds contexts defaulting to
    `documentType: "RESIDENTIAL_RENTAL"` (line 8) and exercises both
    branches of `EXPECTED_CLAUSE_TYPES` indirectly through missing-clause
    scenarios.
  - `riskEnginePass2.test.ts` line 147 is the specific regression test
    pinned to the `LAND_LEASE`-only branch in `landUseContradictionCheck`
    (see §4b) — this is the test most likely to need a deliberate,
    reviewed update when that check moves behind a DomainPack.
  - `riskEnginePass2.test.ts` lines 170–171 ("Pass 2 registry
    extensibility") is the existing proof that new checks can be added
    without touching existing ones — the pattern Part B's design leans on.
- **Integration tests against a real Postgres** (`documents.test.ts`,
  `documentsSummary.test.ts`, `documentsEntitiesClauses.test.ts`,
  `documentsRisks.test.ts`, `documentsGraph.test.ts`, `documentsAsk.test.ts`,
  `promptInjection.test.ts`, `rbac.test.ts`) — per `vitest.config.ts`,
  these run with `fileParallelism: false` against one shared database.
  Spot-checked `documentsGraph.test.ts:61`: it hardcodes
  `.field("documentType", "residential_rental")` when constructing its
  test upload — meaning most integration tests exercise **one domain by
  default** (residential rental) and would not incidentally catch a
  land-lease-specific regression; land-lease behavior is covered mainly
  by the dedicated Pass 1/Pass 2 unit tests above, not the integration
  suite.
- **Frontend tests** (`GraphView.test.tsx`, `page.test.tsx`, and others
  matched on `DocumentType`) appear to use it only as a type/fixture value
  in test data, not as a behavior-under-test — no frontend test was found
  that specifically asserts on `UploadDocumentForm`'s two-option `<select>`
  or on `formatDocumentType`'s ternary.
- **No test in the suite constructs a context with any `documentType`
  value other than `RESIDENTIAL_RENTAL` or `LAND_LEASE`** (expected, since
  no third domain exists yet) — so "no regressions" for a future Step 2
  migration means: every test enumerated above must continue to pass
  **unchanged**, with the sole flagged exception being
  `riskEnginePass2.test.ts:147`, which is allowed to require an updated
  (not deleted) assertion if and only if the underlying behavior it checks
  is deliberately preserved through the new pack-driven path.

---

## Summary of riskiest coupling points (most → least risky to migrate)

1. **`DocumentType` as a Postgres enum** (`schema.prisma:40–45`) — the one
   coupling that can't be resolved in application code alone; adding a
   domain needs a DB migration no matter how the registry above it is
   designed.
2. **`RiskCategory` as a fixed 5-value Postgres enum** (`schema.prisma:89–97`)
   — collides directly with a DomainPack's own `risk_schema` being
   data-driven; a pack that needs a 6th category (or fewer than 5) hits
   the same migration requirement as #1. Flagged as `VERIFICATION_REQUIRED`
   for whoever scopes Step 2 — see below.
3. **`EXPECTED_CLAUSE_TYPES: Record<"RESIDENTIAL_RENTAL"|"LAND_LEASE", string[]>`**
   (`pass1PerClause.ts:78`) — the most literal, compiler-enforced two-value
   branch in the pipeline.
4. **`landUseContradictionCheck`'s `documentType !== "LAND_LEASE"` guard**
   (`pass2CrossClause.ts:123`) — the second explicit branch, with a
   regression test pinned directly to it.
5. **Flat, order-sensitive ontology lists** — `CLAUSE_TAXONOMY`
   (`clauseTaxonomy.ts:21`), `STANDALONE_PATTERNS`/`AMOUNT_KEYWORDS`
   (`rulePatterns.ts:29,128`) — today's two domains coexist in one
   undifferentiated, priority-ordered list per stage, scoped only by
   vocabulary never colliding. This is an architectural fork Part B has to
   resolve explicitly (see the design doc's "known friction point" note):
   does a DomainPack mean *only that pack's* patterns run against a
   document, or do *all registered packs'* patterns still run against
   every document as they effectively do today?
6. **Frontend's three separate hardcoded two-value points**
   (`UploadDocumentForm.tsx`, `apiTypes.ts DocumentType`,
   `format.ts formatDocumentType`) — none of them read from any shared
   source of truth; each was hand-written to match the other two, so all
   three drift silently if only one is updated.
7. **`PARTY_TAG_PATTERN`** (`pass2CrossClause.ts:29`) — narrower than the
   others; hardcodes both domains' role vocabulary in one regex but the
   check itself has no explicit domain branch.

No fabricated legal citations, statutes, or sources were introduced or
required for this audit.
