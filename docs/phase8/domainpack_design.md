# Phase 8, Step 1 — DomainPack Registry Design

This is a design document only. Nothing described here is wired into the
rental or land-lease code paths yet — see
`apps/api/src/domains/registry.ts` for the accompanying scaffold, which
compiles and is unit-tested for its own mechanics (register/retrieve/
duplicate/missing) but is not imported from any existing pipeline stage,
route, or component. See `docs/phase8/step1_audit.md` for the audit this
design is based on; references below to specific coupling points cite that
document's section numbers (e.g. "audit §4").

## 1. Goals and non-goals

**Goals**
- Give the rental and land-lease domains (and any domain added later) a
  single, data-shaped place to declare their ontology and rules, instead
  of that ontology being scattered across five pipeline stages' source
  files as it is today (audit §2–7).
- Let each existing pipeline stage consume a pack's data without being
  rewritten — the stages keep their current signatures and control flow;
  only *where their configuration comes from* changes.
- Carry jurisdiction metadata from day one, even though neither current
  domain varies by state today, because Indian tenancy/land law
  genuinely does vary by state (e.g. state-specific Rent Control Acts /
  the Model Tenancy Act's state-by-state adoption) and retrofitting
  jurisdiction onto an already-migrated registry is more disruptive than
  including an (initially uniform) field now.

**Non-goals** (explicitly, per the task's constraints)
- No plugin marketplace, no dynamic loading from external sources, no
  hot-reloading. Packs are TypeScript modules compiled into the API,
  registered at process startup, full stop.
- No third domain is designed in detail — only a worked mapping of the
  *existing* rental domain onto the DomainPack shape (§5), plus a written
  argument for why a third domain plugs in without further architecture
  changes (§6).
- No migration of rental/land-lease code. That's Step 2.

## 2. The `DomainPack` interface

```ts
export interface DomainPack {
  id: string;                          // stable slug, e.g. "residential_rental"
  name: string;                        // display name, e.g. "Residential Rental Agreement"
  version: string;                     // pack content version, independent of app version

  jurisdiction: JurisdictionScope;

  documentTypes: DocumentTypeDescriptor[];

  entitySchema: EntityTypeDescriptor[];
  clauseSchema: ClauseTypeDescriptor[];
  relationSchema: RelationTypeDescriptor[];   // reserved, see §4.6
  riskSchema: RiskRuleDescriptor;

  legalFrameworks: LegalFrameworkRef[];

  generatorConfig?: unknown;           // opaque to the TS runtime, see §4.8
  evaluationConfig?: unknown;          // opaque to the TS runtime, see §4.8
}
```

Every sub-shape is deliberately close to what a pipeline stage already
consumes today, so "migrate a stage to read from a pack" is mechanical
substitution, not a redesign:

```ts
export interface JurisdictionScope {
  country: string;              // "IN" — ISO 3166-1 alpha-2, not a free string
  state?: string;                // ISO 3166-2 subdivision code, e.g. "IN-KA"; absent = nationwide
  district?: string;             // free text; no ISO list exists at this granularity
  legalFrameworkId?: string;     // cross-reference into legalFrameworks[]; the *default* one for this pack
  referenceVersion: string;      // e.g. "2024-01" — when this pack's legal content was last reviewed
}

export interface LegalFrameworkRef {
  id: string;                    // e.g. "karnataka_rent_control_act_1999"
  title: string;
  jurisdiction: JurisdictionScope;
  note?: string;                 // non-authoritative summary only; never a citation payload the RAG generates from
}

export interface DocumentTypeDescriptor {
  id: string;                    // matches the DB DocumentType enum value where one exists (audit §1)
  label: string;
}

export interface EntityTypeDescriptor {
  label: string;                 // e.g. "LESSOR" — matches Entity.label today (free text, audit §1)
  displayName: string;           // feeds rag/chunking.ts's ENTITY_DISPLAY_NAME (audit §6)
}

export interface ClauseTypeDescriptor {
  clauseType: string;            // matches DocumentClause.clauseType (free text, audit §1)
  headingPattern: RegExp;        // same shape as clauseTaxonomy.ts's CLAUSE_TAXONOMY entries (audit §3)
  priority: number;              // explicit instead of array-position (see §4.3's note on ordering)
}

export interface RelationTypeDescriptor {
  relationType: string;          // matches the reserved Relation.relationType column (schema.prisma)
  subjectEntityLabel: string;
  objectEntityLabel: string;
}

export interface RiskRuleDescriptor {
  expectedClauseTypes: string[];             // replaces EXPECTED_CLAUSE_TYPES[domain] (audit §4)
  missingClauseSeverity: Record<string, RiskSeverity>;
  perClauseChecks: PerClauseCheck[];         // pack-scoped equivalent of pass1PerClause.ts's per-check functions
  comparisonChecks: ComparisonCheckDescriptor[]; // pack-scoped equivalent of pass2CrossClause.ts's COMPARISON_CHECKS
}
```

`PerClauseCheck` and `ComparisonCheckDescriptor` are intentionally left as
thin wrappers around the *existing* `ComparisonCheck` shape
(`pass2CrossClause.ts:14–17`, audit §4b) — a pack doesn't invent a new
rule-authoring format, it just supplies a list of the same
`{ name, run(context) }` objects the risk engine already knows how to run.
This is the one piece of the current codebase that is already an
extensibility-ready registry (proven by the existing
"Pass 2 registry extensibility" test, audit §9) — the design reuses it
rather than replacing it.

## 3. Registry loading mechanism

```ts
export class DuplicatePackError extends Error {}
export class PackNotFoundError extends Error {}

export interface DomainPackRegistry {
  register(pack: DomainPack): void;
  get(id: string): DomainPack;              // throws PackNotFoundError
  tryGet(id: string): DomainPack | undefined;
  list(): readonly DomainPack[];
}

export function createRegistry(): DomainPackRegistry { ... }
```

- **Loading is static and explicit.** At process startup, a single module
  (not built in this step) would call `registry.register(rentalPack)`,
  `registry.register(landLeasePack)`, etc., against one process-lifetime
  registry instance — no filesystem scanning, no dynamic `import()` of
  user-supplied paths, no network fetch. This satisfies the "internal/
  modular, not a plugin marketplace" constraint directly: adding a pack is
  adding one `register()` call at a known call site, reviewed like any
  other code change.
- **Duplicate IDs are rejected at registration time**, not silently
  overwritten — a duplicate `id` is a configuration bug (e.g. copy-pasting
  a pack and forgetting to change its `id`) that should fail loudly at
  startup, not produce two packs silently fighting over the same document
  type.
- **A missing pack is a thrown, typed error at lookup time** (`get`), with
  a non-throwing `tryGet` for call sites that want to fall back (e.g. "no
  pack registered for this legacy document — fall back to today's
  hardcoded behavior" during an incremental Step 2 migration).
- The registry itself holds no database connection, no HTTP client, no
  file I/O — it is a pure in-memory map keyed by `id`. This keeps it
  trivially unit-testable (see §7) without a running Postgres instance,
  unlike most of this codebase's existing tests (audit §9 notes the
  integration suite needs a real Postgres; the registry mechanics
  deliberately do not).

## 4. How each existing pipeline stage would consume a pack

The framing throughout: **stages keep their current function signatures
and orchestration** (`jobs/pipeline.ts`'s `runPipelineStages`, audit's
observation that this is "a hardcoded, linear sequence of function calls"
— that sequencing itself does not need to change). What changes is that
each stage function gains a `pack: DomainPack` parameter (or receives
pre-resolved config derived from one), instead of importing a
module-level constant.

### 4.1 Ingestion / upload
`routes/documents.ts`'s Zod schema (audit §1, line 35) would validate
`documentType` against `registry.list().map(p => p.documentTypes).flat()`
instead of a literal `z.enum([...])` — built once at module load from
whatever packs are registered, so adding a pack automatically widens
accepted upload values with no change to this file.

### 4.2 NER
`rulePatterns.ts`'s `runRuleBasedNer(text)` (audit §2) would become
`runRuleBasedNer(text, pack.entitySchema)` (or take a merged list of
several packs' entity schemas — see the open question in §4.9). The
matching logic itself (`STANDALONE_PATTERNS` iteration, `dropOverlaps`)
is unchanged; only where the pattern list comes from changes. Each pack
supplies its own `EntityTypeDescriptor[]` with its own `RegExp`s, so a new
domain's patterns are additive to the pack's own list, not spliced into
someone else's array by hand.

### 4.3 Clause classification
`clauseTaxonomy.ts`'s `classifyHeading(heading)` (audit §3) becomes
`classifyHeading(heading, pack.clauseSchema)`. The audit flagged that
today's ordering is array-position-dependent and load-bearing; the
`ClauseTypeDescriptor.priority` field (§2) makes that ordering an explicit,
sortable value instead of "whatever order this array happens to be
written in" — each pack's authors set priorities for *their own* clause
types without needing to know another pack's array layout at all.
`clauseSegmenter.ts` itself (the heading-regex segmenter, audit §3) is
**pack-independent and unchanged** — segmentation into candidate spans is
the same for every domain; only classification of an already-segmented
heading consults the pack.

### 4.4 Risk engine
This is where the design does the most direct 1:1 replacement, since audit
§4/§4b found the most explicit branching here:
- `pass1PerClause.ts`'s `EXPECTED_CLAUSE_TYPES[context.documentType]`
  becomes `pack.riskSchema.expectedClauseTypes` — the `Record<"RESIDENTIAL_RENTAL"|"LAND_LEASE", ...>`
  keyed-by-enum shape goes away entirely; the risk engine looks up *which
  pack* a document belongs to once (via the document's `documentType` and
  the registry), then reads that pack's own list. No enum-keyed `Record`
  survives this migration.
  `MISSING_CLAUSE_SEVERITY` becomes `pack.riskSchema.missingClauseSeverity`.
- `pass1PerClause.ts`'s implicitly-domain-scoped checks
  (`detectLiabilityShift`, `detectUnboundedDiscretion` — audit §4, "relies
  on the other domain never containing this clause type") become entries
  in `pack.riskSchema.perClauseChecks`, scoped *explicitly* by which pack
  registers them, rather than *implicitly* by vocabulary never colliding.
  This closes the latent risk the audit flagged: a future domain that does
  use a `MAINTENANCE` clause for something unrelated no longer risks
  tripping a rental-specific check by accident.
- `pass2CrossClause.ts`'s `landUseContradictionCheck` and its explicit
  `if (context.documentType !== "LAND_LEASE")` guard (audit §4b) becomes
  an entry in the land-lease pack's `riskSchema.comparisonChecks` only —
  the guard clause disappears because the check is never invoked at all
  for a document whose pack doesn't register it, rather than being invoked
  and then bailing out.
- `runRiskEngine.ts` changes only in how it assembles `RiskEngineContext`:
  it resolves `registry.get(pack id for this document's documentType)`
  once, then runs `pack.riskSchema.perClauseChecks` and
  `pack.riskSchema.comparisonChecks` instead of the current fixed
  `runPass1`/`COMPARISON_CHECKS` imports. `RiskEngineContext` itself
  (`types.ts`, audit §4c) stops needing `documentType: DocumentType` typed
  against the Prisma enum — it can carry `documentType: string` (matching
  what `graph/types.ts` already does, audit §5) since the pack lookup,
  not the literal enum value, is what now drives behavior.

### 4.5 Knowledge graph
`buildGraph.ts` needs **no changes** (audit §5 already found this stage
fully domain-agnostic — `documentType` is used only as a cosmetic label).
A pack could optionally supply a `documentTypeDisplayLabel` for that
cosmetic use, but nothing about graph construction depends on pack content.

### 4.6 Relations
Reserved and unpopulated today (schema.prisma's `Relation` model, per the
README's "Known Limitations"). `RelationTypeDescriptor` is included in the
interface now specifically so that whenever relation extraction is
eventually implemented, it has a place to declare its ontology per domain
from day one, instead of relation types being invented ad hoc the way
entity/clause types currently are for the two live domains. No relation
extraction pipeline stage exists yet to migrate.

### 4.7 Retrieval / RAG
`chunking.ts`'s `ENTITY_DISPLAY_NAME` (audit §6) becomes
`pack.entitySchema`'s `displayName` field, looked up per entity's label
instead of a module-level flat map. The fallback humanization
(`humanizeLabel`) stays exactly as-is for any label a pack doesn't
describe — this preserves the audit's noted "degrades gracefully" behavior.
`systemInstructions.ts`, `bm25Retriever.ts`, `runAsk.ts` need **no
changes** — audit §6 found these fully generic already, and nothing in the
`DomainPack` interface gives them anything new to consume. A future pack
field for domain-specific QA framing could be added later without
disturbing this design, but isn't needed for rental/land-lease today.

### 4.8 Generator / evaluation config
`generatorConfig` and `evaluationConfig` are typed `unknown` deliberately.
The audit (§8) found the dataset generator lives entirely in Python
(`research/generator/*.py`), decoupled from this TypeScript runtime; this
design does not attempt to unify the two. These two fields exist on the
interface purely so a pack's *documentation* is complete (a reviewer
reading a pack definition can see "here's a pointer to how this domain's
synthetic data and evaluation are configured") without the TS registry
runtime ever interpreting their contents. Designing an actual schema for
these fields is out of scope for Step 1 and is listed as deferred below.

### 4.9 Open design fork the audit surfaced (flagged, not resolved here)

Audit §"Summary of riskiest coupling points," point 5: today, NER and
clause classification run **one merged list covering both domains**
against every document unconditionally (scoped only by vocabulary never
colliding). Once ontology lives in per-pack lists, there are two ways to
wire stage 4.2/4.3 up, with different behavior:

- **(a) Document-scoped**: resolve the document's own pack (via its
  `documentType`) and run only that pack's entity/clause patterns. Matches
  "a document belongs to exactly one domain" more precisely, but is a
  *behavior change* from today (a rental document currently could, in
  principle, match a land-lease pattern if its text happened to contain
  matching vocabulary — unlikely today, but technically possible and
  implicitly relied on never happening).
- **(b) Pack-union**: keep running the union of all registered packs'
  patterns against every document, exactly matching today's behavior
  byte-for-byte, and treat "which pack a document belongs to" as relevant
  only to the risk engine (§4.4) and upload validation (§4.1), not to
  extraction.

This document does not choose between (a) and (b) — that's a real product/
architecture decision with test-suite consequences (§9's audit notes which
tests would need touching either way) and belongs to whoever scopes Step 2,
informed by this audit. It's called out explicitly per the task's
instruction to surface — not quietly work around — anything that makes the
registry design awkward against the current codebase.

## 5. Worked example — mapping the existing rental domain onto a DomainPack

This is a paper exercise: showing what `rentalPack` *would* look like if
Step 2 migrated it, without writing that migration or touching
`pass1PerClause.ts`/`rulePatterns.ts`/etc. today.

```ts
const rentalPack: DomainPack = {
  id: "residential_rental",
  name: "Residential Rental Agreement",
  version: "2026.09.0",

  jurisdiction: {
    country: "IN",
    referenceVersion: "2026-09",
    // No state/legalFrameworkId set: today's rental logic makes no
    // state-specific distinction anywhere in the audited code, so this
    // pack is honestly "nationwide, framework unspecified" rather than
    // fabricating a specific Rent Control Act reference that the current
    // risk rules don't actually implement.
  },

  documentTypes: [{ id: "RESIDENTIAL_RENTAL", label: "Residential Rental" }],

  entitySchema: [
    { label: "LANDLORD", displayName: "Landlord" },
    { label: "TENANT", displayName: "Tenant" },
    { label: "RENT", displayName: "Rent" },
    { label: "SECURITY_DEPOSIT", displayName: "Security deposit" },
    { label: "DURATION", displayName: "Duration" },
    { label: "NOTICE_PERIOD", displayName: "Notice period" },
    { label: "ADDRESS", displayName: "Property address" },
    // (mirrors rulePatterns.ts's STANDALONE_PATTERNS/AMOUNT_KEYWORDS
    //  entries that this domain's generator actually produces — audit §2)
  ],

  clauseSchema: [
    { clauseType: "SECURITY_DEPOSIT", headingPattern: /DEPOSIT/i, priority: 10 },
    { clauseType: "RENT_PAYMENT", headingPattern: /RENT/i, priority: 20 },
    { clauseType: "LEASE_DURATION", headingPattern: /DURATION/i, priority: 30 },
    { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i, priority: 40 },
    { clauseType: "MAINTENANCE", headingPattern: /MAINTENANCE/i, priority: 50 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION/i, priority: 60 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE/i, priority: 70 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION/i, priority: 80 },
  ],

  relationSchema: [],   // unpopulated today for both live domains, audit §4.6

  riskSchema: {
    expectedClauseTypes: [
      "LEASE_DURATION", "RENT_PAYMENT", "SECURITY_DEPOSIT",
      "TERMINATION", "DISPUTE_RESOLUTION", "JURISDICTION",
    ],
    missingClauseSeverity: {
      DISPUTE_RESOLUTION: "MEDIUM",
      JURISDICTION: "MEDIUM",
      SECURITY_DEPOSIT: "HIGH",
      TERMINATION: "HIGH",
      LEASE_DURATION: "HIGH",
      RENT_PAYMENT: "HIGH",
    },
    perClauseChecks: [
      /* the existing detectLiabilityShift / detectUnboundedDiscretion
         logic, unchanged, just scoped to this pack's registration
         instead of implicit vocabulary scoping — audit §4 */
    ],
    comparisonChecks: [
      /* the existing asymmetricObligationCheck — audit §4b notes this
         check is already domain-agnostic by construction, so both the
         rental and land-lease packs would register it (or it moves to
         a shared "cross-domain checks always run" list — a Step 2
         decision, not resolved here) */
    ],
  },

  legalFrameworks: [],
  // Deliberately empty, not fabricated: the audited risk_engine.md and
  // adversarial_test_design.md (the actual authorities behind today's
  // five categories) don't cite a specific statute per rule, so this
  // pack doesn't invent one. Per the task's constraint against
  // fabricating legal citations, an honestly-empty list is correct here.
};
```

Two things this worked example demonstrates on paper:
1. Every field maps cleanly from something that already exists in the
   audited code — nothing here required inventing new ontology, new risk
   categories, or new legal content.
2. It also demonstrates §4.9's open fork concretely: `asymmetricObligationCheck`
   doesn't obviously belong to *either* pack alone, since it's genuinely
   domain-agnostic today. That ambiguity is real, not an artifact of this
   example being contrived, which is exactly why §4.9 is flagged rather
   than silently resolved by, e.g., arbitrarily assigning it to one pack.

## 6. How a third domain would plug in (on paper)

Say a future "commercial lease" domain is added (hypothetically only —
not implemented, and the README's "Known Limitations" still lists
commercial leases as explicitly out of scope for this project overall).
On paper, adding it means:

1. Author a `commercialLeasePack: DomainPack` object, following the same
   shape as the worked example in §5 — its own `entitySchema`,
   `clauseSchema`, `riskSchema`, and (unlike the current two domains,
   which don't need it) potentially a real `jurisdiction.legalFrameworkId`
   if commercial lease risk rules are meant to vary by state.
2. Add one line — `registry.register(commercialLeasePack)` — at the
   startup module where `rentalPack`/`landLeasePack` are already
   registered (§3).
3. Add `"COMMERCIAL_LEASE"` as a third `DocumentType` enum value — this
   is the one step that is *not* pure application code (audit §1's
   riskiest coupling point #1): it requires a Prisma migration
   (`ALTER TYPE document_type ADD VALUE 'commercial_lease'`), and, if the
   new domain needs a risk category the existing 5 don't cover, a second
   migration on `RiskCategory` (audit's riskiest coupling point #2).
4. No changes required to `buildGraph.ts` (§4.5), `systemInstructions.ts`,
   `bm25Retriever.ts`, or `runAsk.ts` (§4.7) — confirmed already
   domain-agnostic by the audit.
5. No changes required to `clauseSegmenter.ts`'s heading-detection regex,
   *provided* the new domain's source documents follow the same numbered
   all-caps heading convention the synthetic generator uses — if they
   don't, that's a pre-existing limitation (audit §3) affecting any new
   domain equally, not something specific to a third pack.
6. The frontend's three hardcoded two-value points (audit §7 —
   `UploadDocumentForm.tsx`, `apiTypes.ts`, `format.ts`) would need to
   become "read from `GET /domain-packs` (a new, small endpoint exposing
   `registry.list()`'s `documentTypes`/`name` fields)" instead of literal
   unions — this is real frontend work, but it is *replacement* of three
   already-identified spots, not new discovery.

This demonstrates the registry is provably extensible in the sense the
task asked for — a reviewer can see exactly what changes and what doesn't
— without this step actually implementing step 3.

## 7. Scaffold

`apps/api/src/domains/registry.ts` (new file) contains:
- The `DomainPack` interface and all sub-interfaces from §2.
- `DuplicatePackError`, `PackNotFoundError`.
- `createRegistry()` returning a `DomainPackRegistry` (§3): `register`,
  `get`, `tryGet`, `list`. Backed by a plain `Map<string, DomainPack>`
  closed over inside the factory function — no module-level singleton, so
  tests can create isolated registry instances (matching this codebase's
  existing preference for dependency-injected, unit-testable pure logic
  over shared global state, as seen in `pass2CrossClause.ts`'s
  `runPass2(context, checks = COMPARISON_CHECKS)` default-parameter
  pattern).

This module is **not imported anywhere** outside its own test file —
`grep -rn "domains/registry" apps/api/src --include=*.ts` (run after
writing the scaffold, see report-back) confirms zero references from
`routes/`, `risk/`, `ner/`, `clauses/`, `graph/`, `rag/`, or `jobs/`.

`apps/api/tests/domainRegistry.test.ts` (new file) tests only the
registry's own mechanics against minimal fixture packs — not any real
domain's actual ontology — per §3:
- registering and retrieving a pack by id,
- `list()` reflecting all registered packs,
- registering a second pack with a duplicate `id` throws `DuplicatePackError`
  and does not replace the original,
- `get()` on an unregistered id throws `PackNotFoundError`,
- `tryGet()` on an unregistered id returns `undefined` rather than throwing.

## 8. Summary: what this design does and doesn't touch

| Area | Touched by this design? |
|---|---|
| `apps/api/src/domains/registry.ts` (new) | Created, scaffold only |
| `apps/api/tests/domainRegistry.test.ts` (new) | Created, scaffold only |
| `rulePatterns.ts`, `clauseTaxonomy.ts`, `pass1PerClause.ts`, `pass2CrossClause.ts`, `chunking.ts`, `routes/documents.ts`, any frontend file | **Not touched.** Described in §4 as future consumers only. |
| `schema.prisma` | **Not touched.** No migration created or proposed as code — §1/§6 only note that migrations will eventually be needed. |
| Synthetic dataset / generator | **Not touched**, per constraints. |
| Existing tests | **Not touched.** All must still pass unchanged — see report-back. |
