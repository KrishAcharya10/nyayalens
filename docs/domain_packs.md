# Domain packs

A **domain pack** holds everything that differs between kinds of legal
document (rental, land lease, sale, employment, ...) as data plus a few
pluggable check functions. The pipeline stays domain-independent: every
stage asks the registry for the document's pack instead of branching on
its type.

Code: `apps/api/src/domains/` (`registry.ts` is the contract,
`index.ts` registers the packs). History: `docs/phase8/` (Step 1 audit,
Step 2 migration and enum decision).

## Identifiers

| Thing | Example | Where it lives |
|---|---|---|
| Domain id (`pack.id`) | `sale_property` | the pack |
| Document type (`documentTypes[].id`) | `SALE_DEED` | DB `DocumentType` enum, `Document.documentType` |
| Upload slug (`documentTypes[].slug`) | `sale_deed` | the enum's `@map`; what `POST /documents` accepts |

A domain can own several document types (sale owns agreement to sell and
sale deed). Pipeline code resolves a pack with
`registry.forDocumentType(document.documentType)`, never by domain id.
Each document type belongs to exactly one pack; registering a second
owner throws `DuplicateDocumentTypeError`.

## The contract

| Field | Purpose | Consumed by (today) |
|---|---|---|
| `id`, `name`, `description`, `version` | identity | `GET /domain-packs`, upload form |
| `jurisdiction` | country/state scope + review date | metadata |
| `documentTypes` | document types + upload slugs | upload validation, registry lookup |
| `entitySchema` | `{label, displayName, coreType}` per entity role | **rule-based NER allow-list**, structured QA vocabulary, overview card, `/domain-packs` |
| `clauseSchema` | `{clauseType, headingPattern, priority}` | **clause classifier** (lowest priority matched first) |
| `partyTerms`, `extraction` | words that name each party; value rules (cue before/after a value) | **pack NER engine** (`ner/packNer.ts`), obligation actor resolution |
| `overviewFields` | the labels shown on the domain Overview card | `GET /documents/:id/overview` |
| `relationSchema` | `{relationType, subject, object}` | **relation extraction** (`semantic/extract.ts`), graph |
| `obligationSchema` | `{action, actorLabels, verbPattern?}` | **obligation extraction**, unexpected-actor flag |
| `riskSchema` | expected clauses, missing-clause severities, Pass 1 and Pass 2 checks | **risk engine** |
| `consistencyRules` | `SINGLE_VALUE` / `SUM` / `DATE_ORDER` / `EXPECTED_ACTOR` rules | **consistency engine** (`consistency/engine.ts`) |
| `detection` | title + lexical regexes per document type | **domain detection** (`domains/detectDomain.ts`) |
| `legalFrameworks` | reference metadata (see `legal_reference_policy.md`) | `/domain-packs`, LEGAL_REFERENCE graph nodes (`RELEVANT_TO`) - never used to produce a finding |
| `generatorConfig`, `evaluationConfig` | pointers to generator / evaluation config | documentation |

### Three-layer entity ontology

1. **Core type** (`coreType`), the same in every domain: `PARTY`,
   `PERSON`, `ORGANIZATION`, `MONEY`, `PERCENT`, `DATE`, `DURATION`,
   `ADDRESS`, `LOCATION`, `PROPERTY_IDENTIFIER`, `AREA`, `TEXT`.
2. **Role** (`label`, stored in `Entity.label`), specific to the domain:
   `LESSOR` is a `PARTY`, `SECURITY_DEPOSIT` is `MONEY`.
3. **Relations** between roles (`relationSchema`): `TENANT -MUST_PAY->
   RENT`. Subject `DOCUMENT` means the agreement itself
   (`DOCUMENT -HAS_TERM-> DURATION`).

## Adding a domain

1. Write `apps/api/src/domains/<domain>Pack.ts` implementing
   `DomainPack<RiskEngineContext, RiskFinding>`. Check implementations
   live in the pack file or `risk/sharedChecks.ts`, never in
   `pass1PerClause.ts`/`pass2CrossClause.ts` (that would create an import
   cycle - see `docs/phase8/step2_migration_notes.md`).
2. Register it in `domains/index.ts`.
3. Add each new document type to the `DocumentType` enum in
   `packages/db/prisma/schema.prisma` with `@map("<slug>")`, then create a
   migration (`npm run db:migrate`).
4. Run `tests/domainPackEnumDrift.test.ts`. It fails until the registry
   and the DB enum agree in both directions, and it also checks the pack's
   ontology integrity (core types, relation endpoints, obligation actors,
   expected clause types, unique clause priorities).

The upload form needs no change: it reads `GET /domain-packs`.

## Registered packs

| Domain | Document types | Entity roles | Clause types | Relations | Obligation actions | Consistency rules | Legal references |
|---|---|---|---|---|---|---|---|
| `residential_rental` | `RESIDENTIAL_RENTAL` | 15 | 19 | 10 | 5 | 6 | 3 |
| `land_lease` | `LAND_LEASE` | 19 | 19 | 12 | 5 | 7 | 3 |
| `leave_and_license` | `LEAVE_AND_LICENSE` | 16 | 16 | 12 | 6 | 7 | 4 |
| `sale_property` | `AGREEMENT_TO_SELL`, `SALE_DEED` | 29 | 20 | 28 | 8 | 15 | 3 |
| `builder_buyer` | `BUILDER_BUYER_AGREEMENT` | 23 | 14 | 16 | 6 | 8 | 3 |
| `employment` | `EMPLOYMENT_CONTRACT`, `OFFER_LETTER`, `APPOINTMENT_LETTER` | 20 | 16 | 16 | 7 | 7 | 2 |
| `nda_msa` | `NDA`, `MUTUAL_NDA`, `SERVICE_AGREEMENT`, `MSA` | 22 | 20 | 16 | 7 | 11 | 3 |
| **Total** | 13 | 144 | 124 | 110 | 44 | 61 | 21 |

Clause types count distinct types; a type may have several heading
patterns (synonyms) at different priorities.

### Keeping the generator in sync

`research/generator/v3/ontology.json` is exported from the packs
(`npm run export:ontology --workspace=apps/api`). The Python generator
validates every label, clause type, relation and obligation it emits
against it, and `tests/ontologyExport.test.ts` fails when the export is
stale.

## Milestone 1 changes (Phase 8)

- The contract gained `description`, `slug`, `coreType`, `obligationSchema`,
  `consistencyRules`, `detection`, richer `legalFrameworks`, and
  `forDocumentType` / `findDocumentTypeBySlug` on the registry. Pack ids
  became domain slugs.
- **NER and clause classification are now document-scoped** (both items
  `docs/phase8/step2_migration_notes.md` deferred). `runRuleBasedNer(text)`
  and `runRuleBasedClauseClassification(text)` keep their single-argument
  union behavior, so existing callers and tests are unchanged; the pipeline
  and `scripts/backfill-rule-based-ner.mjs` pass the pack.
- **Parity, measured, not assumed:** union and scoped output were compared on
  every document in `synthetic/` (300), `adversarial/` (150) and
  `synthetic_v2/` (1,200). There were zero differences in NER spans or
  clause classifications. Scoping changes behavior only where vocabulary
  crosses domains, which is covered by `tests/domainScoping.test.ts`.
- `POST /documents` validates `documentType` against the registry. The old
  ternary that stored any unknown value as `LAND_LEASE` is gone; unknown
  slugs get a 400 listing the allowed ones.
- New `GET /domain-packs` (auth required; no regexes or functions
  exposed). The upload form renders its options from it, grouped by
  domain.
- Entity schemas now include the v2 generator's labels. `LAND_USE_RESTRICTION`,
  always generated for land leases, was missing from the land pack.
  `ADDRESS` is labeled "Place of execution", which is what both generators
  actually mark.

## Milestones 2-5 changes (Phase 8)

- Five new packs (`leave_and_license`, `sale_property`, `builder_buyer`,
  `employment`, `nda_msa`), eleven new `DocumentType` enum values (one
  migration), new risk categories and the `CONSISTENCY` pass.
- **Pack NER engine** (`ner/packNer.ts`): party names from `partyTerms`
  (definitions, "hereinafter", signature blocks), values from cue rules.
  New packs set `legacyPatterns: false`; the two original packs keep the
  legacy patterns, and v1 output is unchanged except for correct additions
  (v1 exact matches 2,347 -> 2,552, no entity lost).
- **Clause segmentation** handles numbered caps, `N)`, `Clause N:`,
  `ARTICLE IV -`, title case and unnumbered SCHEDULE / ANNEXURE / RECEIPT
  sections; `clauseNumber` is a string.
- **Semantic layer, consistency engine, domain detection, structured QA,
  graph extension and comparison** read the pack fields listed above - see
  `docs/architecture.md` sections 5-7.
- Heading synonyms found on the seed-99 development set ("PERIOD OF
  TENANCY", "USE OF LAND", "GOVERNING LAW", "Price of the Apartment",
  "TERMINATION AND HANDOVER", "TERM AND SURVIVAL") were added as extra
  `clauseSchema` entries; none of them matches a v1 heading.
