# Phase 8, Step 2 — Migration Notes

This documents the decisions made while migrating the existing rental and
land-lease domains into the Step 1 DomainPack registry: what moved where,
the two "document-scoped vs. pack-union" resolutions (they are different
for different stages, and that's disclosed here rather than papered over),
the attribution table (verified against the actual generator source, not
guessed), and an architectural constraint this migration ran into and
resolved deliberately. See `docs/phase8/step1_audit.md` and
`docs/phase8/domainpack_design.md` for the audit and design this builds on,
and `docs/phase8/step2_enum_decision.md` for the enum-vs-free-text decision
(Part A).

## What actually moved, file by file

| File | Change |
|---|---|
| `apps/api/src/domains/registry.ts` | `DomainPack`/`RiskRuleDescriptor`/`RiskCheckDescriptor` made generic over `<TContext, TFinding>` (default `unknown`) so the registry itself still has zero dependency on risk-engine types - only the concrete pack files instantiate `DomainPack<RiskEngineContext, RiskFinding>`. |
| `apps/api/src/domains/index.ts` (new) | The one place both packs are registered - a lazily-initialized singleton `getDomainPackRegistry()`, not a module-top-level side effect (see "the import-cycle problem" below for why lazy). |
| `apps/api/src/domains/rentalPack.ts` (new) | `residentialRentalPack`. Owns `detectLiabilityShift`/`detectUnboundedDiscretion` (moved verbatim from the old `pass1PerClause.ts` - same regexes, same reason text, same severities), plus `entitySchema`/`clauseSchema`/`riskSchema` data. |
| `apps/api/src/domains/landLeasePack.ts` (new) | `landLeasePack`. Owns `landUseContradictionCheck` (moved verbatim **minus** its old inline `documentType !== "LAND_LEASE"` guard - see below), plus its own `entitySchema`/`clauseSchema`/`riskSchema` data. |
| `apps/api/src/risk/missingClauseCheck.ts` (new) | `detectMissingClauses`/`makeMissingClauseCheck` - the old `detectMissingClauses`, generalized to take `expectedClauseTypes`/`missingClauseSeverity` as parameters instead of doing an internal `EXPECTED_CLAUSE_TYPES[context.documentType]` lookup. Domain-agnostic; both packs import it. |
| `apps/api/src/risk/sharedChecks.ts` (new) | `asymmetricObligationCheck` - moved verbatim from the old `pass2CrossClause.ts`. Both packs register the same instance (see "shared checks" below). |
| `apps/api/src/risk/pass1PerClause.ts` | Rewritten to a ~15-line pure orchestrator: `runPass1(context, riskSchema = getDomainPackRegistry().get(context.documentType).riskSchema)`. No longer owns `EXPECTED_CLAUSE_TYPES`, `MISSING_CLAUSE_SEVERITY`, or either per-clause check's implementation. |
| `apps/api/src/risk/pass2CrossClause.ts` | Rewritten similarly: `runPass2(context, checks = getDomainPackRegistry().get(context.documentType).riskSchema.comparisonChecks)`. `COMPARISON_CHECKS` kept as an exported union (both packs' `comparisonChecks` combined) purely for `riskEnginePass2.test.ts`'s existing import of it - `runPass2`'s own default no longer uses it. |
| `apps/api/src/risk/types.ts` | `RiskEngineContext.documentType` widened from the Prisma `DocumentType` enum type to `string` (matches `graph/types.ts`'s existing `BuildGraphInput.documentType: string`). Added `RiskCheck` (the `{name, run(context)}` shape `pass2CrossClause.ts`'s `ComparisonCheck` already had - now the canonical name; `ComparisonCheck` is a type alias of it). |
| `apps/api/src/risk/runRiskEngine.ts` | Now resolves `const pack = getDomainPackRegistry().get(context.documentType)` once and passes `pack.riskSchema`/`pack.riskSchema.comparisonChecks` into `runPass1`/`runPass2` explicitly - the real pipeline never relies on either function's own default-parameter registry lookup. |
| `apps/web/src/lib/format.ts` | Part B's bug fix (own diff) - see below. |
| `apps/web/src/lib/apiTypes.ts` | `DocumentType` widened from `"RESIDENTIAL_RENTAL" \| "LAND_LEASE"` to `string`. |
| `apps/web/src/lib/api.ts` | `uploadDocument`'s `documentType` parameter widened from the two-value union to `string`. |
| `apps/web/src/components/documents/UploadDocumentForm.tsx` | The hardcoded `useState<"residential_rental"\|"land_lease">` and two hand-written `<option>` elements replaced with a `DOCUMENT_TYPE_OPTIONS` array rendered via `.map()`. |
| `apps/api/tests/riskEnginePass2.test.ts` | One test's title/comment updated (not its assertion) - see "the one authorized test change" below. |

**Not touched, deliberately:** `apps/api/src/ner/rulePatterns.ts`,
`apps/api/src/clauses/clauseTaxonomy.ts`,
`apps/api/src/clauses/ruleBasedClauseClassifier.ts`,
`apps/api/src/jobs/pipeline.ts`'s NER/clause-classification call sites, and
`apps/api/src/routes/documents.ts`'s upload validation schema. See
"Deferred to Step 3" below for why.

## The two different answers to "document-scoped vs. pack-union"

Step 1's design doc (§4.9) flagged this as an open fork without resolving
it. Step 2 resolved it - but with **two different answers for two different
stages**, both backed by concrete reasons, not a single blanket choice:

**Risk checks: document-scoped.** `runRiskEngine.ts` resolves exactly one
pack per document and runs only that pack's `perClauseChecks`/
`comparisonChecks`. This is what makes `landUseContradictionCheck`
land-lease-only "by registration" instead of by its old inline guard - the
explicit ask in Part C.3.

**NER pattern matching and clause-heading classification: not migrated in
this step; existing pack-union-equivalent behavior is unchanged.** This
is the "concrete reason" clause the task's own instructions allowed for.
`apps/api/tests/ruleBasedNer.test.ts` and
`apps/api/tests/ruleBasedClauseClassifier.test.ts` call
`runRuleBasedNer(text)`/`runRuleBasedClauseClassification(text)` with a
**single argument** and require the same call to correctly recognize
**both** domains' vocabulary depending only on which document's text is
passed (e.g. `ruleBasedNer.test.ts`'s one test finds `LESSOR`/`LESSEE` on
land-lease documents and `LANDLORD`/`TENANT` on residential ones, all via
the same `runRuleBasedNer(labels.text)` call). This is real, load-bearing
test coverage this task was not authorized to change (only
`riskEnginePass2.test.ts:147` was). Making these functions require a
domain/pack argument would break that coverage; making the argument
optional-but-defaulting-to-the-union-of-every-pack would preserve it but
also mean the description would be "document-scoped when a pack is
explicitly passed" while nothing in the actual pipeline ever passes one -
`jobs/pipeline.ts`'s call sites were left unchanged too, so pack-union
(today's actual, unchanged behavior) is genuinely what still runs in
production for these two stages. `entitySchema`/`clauseSchema` were still
populated on both packs with the real, generator-verified per-domain
ontology (see the attribution table below) - as accurate, reusable
**descriptive data** for a future consumer (a `/domain-packs` endpoint, or
Step 3's actual rewiring of these two stages) - but nothing currently
reads that data to drive matching. This is disclosed as a deferred item
below, not silently left inconsistent with the rest of the migration.

## The one authorized test change

`riskEnginePass2.test.ts`'s "never runs the land-use check for
residential_rental documents" test: **its assertion is byte-identical**
to before the migration. Only its title and a new explanatory comment
changed, because *why* the assertion passes changed - before,
`landUseContradictionCheck` had its own inline
`documentType !== "LAND_LEASE"` guard that this test exercised directly;
now, the check simply isn't in `residentialRentalPack.riskSchema.comparisonChecks`
at all, so `runPass2(context)` for a `RESIDENTIAL_RENTAL` context never
even reaches it. Confirmed by running the full suite before writing this
test edit: it already passed with the new code and the old title/comment,
proving the behavior didn't move before the description was updated to
match.

## Shared / ambiguous risk checks: `asymmetricObligationCheck`

Step 1's audit and design doc both flagged this check as genuinely
domain-agnostic by construction (it matches on party-tag vocabulary
`LANDLORD`/`TENANT`/`LESSOR`/`LESSEE` generically, not on `documentType`).
Rather than force an arbitrary single owner, **both** `residentialRentalPack`
and `landLeasePack` register the *same* `asymmetricObligationCheck`
instance (imported from `risk/sharedChecks.ts`) in their own
`riskSchema.comparisonChecks`. This preserves the pre-migration behavior
exactly (the check ran for both domains before, unconditionally) while
still being pack-scoped in the sense that matters for Step 3: a brand new
domain that wants this same asymmetric-notice-period check can register
it too, and one that doesn't (e.g. a domain with no two-party notice
structure at all) simply doesn't list it.

## The import-cycle problem, and how it was resolved

Early in this migration, the natural-looking design was: keep
`detectLiabilityShift`/`detectUnboundedDiscretion`/`asymmetricObligationCheck`/
`landUseContradictionCheck` defined in `pass1PerClause.ts`/`pass2CrossClause.ts`
as before, and have `rentalPack.ts`/`landLeasePack.ts` **import** them from
there to build each pack's `riskSchema`. That does not work: `runPass1`/
`runPass2` must resolve `getDomainPackRegistry().get(context.documentType)`
internally (as a default-parameter expression) to stay callable with a
single argument, exactly as `riskEnginePass1.test.ts`/`riskEnginePass2.test.ts`
already do and were not authorized to change. That means
`pass1PerClause.ts`/`pass2CrossClause.ts` must import `domains/index.ts`.
If `domains/index.ts` (via the two pack files) also imports check
implementations back out of `pass1PerClause.ts`/`pass2CrossClause.ts`, that
is a real circular import - traced concretely, it means each pack's
top-level `export const ...Pack = {...}` object literal would try to
reference a check function that is `undefined` at that point in the load
order (the check-owning file is still stuck mid-import, waiting on
`domains/index.ts`, which is waiting on the pack file, which is waiting on
the check-owning file). This was caught before it shipped, not discovered
as a runtime bug - the fix is the layering actually implemented: check
*implementations* moved to files with no dependency on `domains/index.ts`
at all (`risk/sharedChecks.ts`, `risk/missingClauseCheck.ts`, and the pack
files themselves for domain-exclusive checks), so
`pass1PerClause.ts`/`pass2CrossClause.ts` can depend on `domains/index.ts`
in one direction only, with nothing importing back. Per the task's own
instruction to flag rather than push through an awkward fit: this is
exactly that kind of finding, and it shaped the final file layout rather
than being worked around with a runtime hack (e.g. a dynamic `import()`,
which would have forced `runPass1`/`runPass2` to become `async` and broken
both test files' synchronous calls).

## Attribution table (verified against the generator, not guessed)

Before attributing any entity/clause type to a pack, each was checked
against `research/generator/generator.py`'s `build_residential_rental()`/
`build_land_lease()` and `research/generator/adversarial_generator.py`'s
preamble/check-building helpers - not inferred from naming alone.

| Type | Attribution | Verified via |
|---|---|---|
| `LANDLORD`, `TENANT` (entities) | residential-only | `generator.py:90-95` (`build_residential_rental` only) |
| `SECURITY_DEPOSIT` (entity + clause) | residential-only | `generator.py:128-133`; `adversarial_generator.py:17-18` comment confirms explicitly |
| `MAINTENANCE` (clause) | residential-only | `generator.py:151-153`; same adversarial comment |
| `LESSOR`, `LESSEE` (entities) | land-lease-only | `generator.py:211-216`, `adversarial_generator.py:107-123` |
| `SURVEY_NUMBER`, `LAND_AREA`, `LAND_USE_TYPE` (entities) | land-lease-only | `generator.py:222-226`; `adversarial_generator.py:20` comment confirms `LAND_USE_TYPE` explicitly |
| `LEASE_PREMIUM` (entity + clause) | land-lease-only | `generator.py:243-248` |
| `ENCUMBRANCE_DECLARATION` (clause) | land-lease-only | `generator.py:277-283` |
| `RENT`, `RENT_PAYMENT` | **shared** | `generator.py:116-122` (residential) and `:257-260` (land lease) |
| `DURATION`, `LEASE_DURATION` | **shared** | `generator.py:106-110` (residential) and `:233-237` (land lease) |
| `NOTICE_PERIOD` (entity + clause) | **shared** | `adversarial_generator.py:335-388`'s `build_asymmetric_obligation` emits it for **both** `document_type` branches via one shared helper (line 244-246) |
| `ADDRESS` (entity) | **shared** | `generator.py:87` (residential) and `:208` (land lease) |
| `TERMINATION`, `DISPUTE_RESOLUTION`, `JURISDICTION` (clauses) | **shared** | present in both `build_residential_rental` and `build_land_lease` |
| `KHATA_NUMBER`, `EASEMENT_RIGHT` (entities) | attributed land-lease-only, **not generator-verified** | never emitted by the generator for either domain - `rulePatterns.ts`'s own header comment already documents these as untested extensions ("real Indian land-record concepts... UNTESTED against synthetic ground truth"); attributed here on that semantic basis only |
| `CROP_OR_CULTIVATION_RIGHTS` (clause) | attributed land-lease-only, **not generator-verified** | never emitted by the generator for either domain; same caveat as above |

**The one caveat this attribution carries:** `KHATA_NUMBER`/`EASEMENT_RIGHT`/
`CROP_OR_CULTIVATION_RIGHTS` have zero effect on any synthetic document
either way (never generated), so this attribution is fully
parity-safe for the entire existing dataset - confirmed empirically below.
It is a live judgment call only for a hypothetical **real** (non-synthetic)
uploaded residential-rental document that happens to contain the words
"Khata No." or "easement" - under a future document-scoped NER migration
(not done in this step - see "Deferred to Step 3"), such a document would
stop having that pattern checked, where today's pack-union behavior would
still catch it. Flagged here rather than silently decided, per the task's
instructions.

## Empirical parity verification (not just unit tests)

Beyond the full pre-existing test suite passing unchanged (see the PR
report), the migrated risk engine was re-run against all 150 real
documents in `research/data/adversarial/` (both domains, all 5 categories,
matched controls included) using `runRiskEngine` end-to-end, then scored
with the existing `apps/api/scripts/evaluate-adversarial.mjs`. Every
category reproduced **exactly** the numbers already documented in
`docs/architecture/adversarial_evaluation_results.md` from before this
migration: 15/15 (1.00) detection rate, 0/15 (0.00) control false-positive
rate, zero cross-category false positives, and 15/15 (1.00) evidence
correctness for the two categories that check it (asymmetric_obligation,
land_use_contradiction). This is real evidence across the actual dataset,
not an inference from the unit tests alone.

## Deferred to Step 3

- Rewiring `rulePatterns.ts`/`clauseTaxonomy.ts` to actually consume a
  pack's `entitySchema`/`clauseSchema` for document-scoped matching (see
  above) - would need `ruleBasedNer.test.ts`/`ruleBasedClauseClassifier.test.ts`
  reconsidered first, which was out of this step's authorized scope.
- A live `/domain-packs`-style endpoint so the frontend's
  `UploadDocumentForm.tsx` fetches its options instead of reading a local
  constant. Not built in this step because doing so safely would also
  require touching `routes/documents.ts`'s `uploadMetadataSchema`
  (currently a hardcoded lowercase `z.enum(["residential_rental","land_lease"])`
  - a *different* wire format than the pack registry's uppercase
  `DocumentTypeDescriptor.id`), which Part C.2's explicit file list did not
  include. `UploadDocumentForm.tsx` was still rewired to render from a
  data-driven list instead of two hand-written `<option>` elements, which
  is real progress without touching the excluded file.
- The recommended enum/registry drift check from
  `docs/phase8/step2_enum_decision.md` ("Recommended mitigation") - not
  implemented speculatively in this step; recommended for whenever Step 3
  adds a real second `DocumentType` value, so the check is exercised in
  both directions immediately.
- Adding the first genuinely new domain (property) - the next step,
  explicitly out of scope for Step 2.
