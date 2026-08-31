# Phase 6: risk engine architecture

Implements the five risk categories `docs/research/adversarial_test_design.md`
specifies, using the two-pass split that design note called for up front
("the risk engine's design ... should account for this from the start
rather than discovering the need for a document-wide comparison pass
partway through implementation").

## Pass 1 vs Pass 2 — why two components, not one classifier

- **Pass 1** (`apps/api/src/risk/pass1PerClause.ts`) only ever looks at
  one clause at a time (or, for missing-clause, the document's set of
  *clause types*, never a clause's content against another clause's
  content). Categories 1 (silent liability shift), 3 (vague discretionary
  language) and 5 (clean absence) all fit this shape - reading a single
  clause, correctly, is enough to catch them.
- **Pass 2** (`apps/api/src/risk/pass2CrossClause.ts`) sees the *whole*
  document's clauses and entities at once and compares two or more of
  them against each other. Categories 2 (asymmetric obligations) and 4
  (cross-entity/cross-clause contradiction) are undetectable from any
  single clause in isolation by construction - the adversarial test
  design deliberately keeps each individual clause "unremarkable," so a
  per-clause classifier structurally cannot catch them no matter how good
  it is.

This isn't a stylistic split. A per-clause classifier's input shape is
"one clause's text"; a cross-clause check's input shape is "the
document's entire clause/entity set." Bolting category 2/4 detection onto
Pass 1 would mean silently changing what every check receives, for only
two of five categories - keeping them as a separate pass with a different
input contract (`RiskEngineContext`, all clauses + entities) is the
simpler design, not a more complex one.

`runRiskEngine.ts` runs both passes unconditionally, in order, against
the same loaded `RiskEngineContext`, and merges their findings before
persisting - callers of `runRiskEngine()` never see "pass 1" and "pass 2"
as separate invocations, only the `pass` field on each persisted `Risk`
row.

## `model_source` is an explicit parameter, never an implicit assumption

`runRiskEngine(documentId, modelSource: ModelSource = "RULE_BASED")` -
the risk engine loads `DocumentClause`/`Entity` rows filtered by whichever
`model_source` is passed in, and persists findings tagged with that same
`model_source`. `RULE_BASED` is the default because it's the only
currently reliable entity/clause source (`generic_transformer`'s labels
never match the domain ontology at all; `fine_tuned` currently persists
zero entities - see `evaluation_results.md`), but nothing in `pass1PerClause.ts`
or `pass2CrossClause.ts` hardcodes that assumption. A future working
`fine_tuned` model is a drop-in swap via this one parameter - no risk-engine
code changes required.

## The five categories, as implemented

| # | Category (enum) | Pass | Applies to | Detector |
|---|---|---|---|---|
| 1 | `LIABILITY_SHIFT` | 1 | `residential_rental` only | `detectLiabilityShift` - a `MAINTENANCE` clause whose text assigns "structural repairs" to the Tenant (the normal allocation is Landlord) |
| 2 | `ASYMMETRIC_OBLIGATION` | 2 | both | `asymmetricObligationCheck` - two party-tagged `NOTICE_PERIOD` clauses whose nested `NOTICE_PERIOD` entity values differ by ratio ≥ 2.0 **and** ≥ 10 days |
| 3 | `UNBOUNDED_DISCRETION` | 1 | `residential_rental` only | `detectUnboundedDiscretion` - a `SECURITY_DEPOSIT` clause matching one of a closed set of discretionary phrases ("as deemed fit by", "at the sole discretion of", "as determined solely by") |
| 4 | `LAND_USE_CONTRADICTION` | 2 | `land_lease` only | `landUseContradictionCheck` - a `LAND_USE_TYPE` entity reading "Agricultural" (not "Non-agricultural") paired with a `LAND_USE_RESTRICTION` clause describing a non-agricultural use (warehouse/commercial retail/industrial/"construction of") |
| 5 | `MISSING_CLAUSE` | 1 | both (different expected sets) | `detectMissingClauses` - document-level: which of `EXPECTED_CLAUSE_TYPES[documentType]` are absent from the clause set entirely |

### Scoping note: why categories 1/3/4 aren't universal

`research/generator/generator.py`'s two document types don't share every
clause concept:

- Land leases in this generator have no `MAINTENANCE` clause to shift
  liability on, and no refundable-deposit concept for category 3's
  discretionary-deduction pattern - so categories 1 and 3 only ever run
  meaningfully against `residential_rental` documents (nothing prevents
  them running against `land_lease`, they simply never find a matching
  clause type to inspect).
- Residential rentals have no `LAND_USE_TYPE` entity or land-use-restriction
  concept, so category 4's check returns immediately (`if
  (context.documentType !== "LAND_LEASE") return []`) for every
  `residential_rental` document.

This is a property of what the two document types actually contain, not
an arbitrary restriction - see `adversarial_evaluation_results.md` for how
this shows up as structurally-zero cross-category false positives for
these combinations (a residential document can never trigger
`LAND_USE_CONTRADICTION` because it has no `LAND_USE_TYPE` entity, not
because of any special-casing to prevent it).

## Severity rubric

Severity is a fixed, documented value per finding - not learned or scored
on a continuous scale:

- **Category 1 (`LIABILITY_SHIFT`)**: always `HIGH` - shifting a
  structural-repair obligation is a substantial, concrete cost shift.
- **Category 2 (`ASYMMETRIC_OBLIGATION`)**: `HIGH` if the larger notice
  period is ≥ 3× the smaller, otherwise `MEDIUM` (still above the 2.0×/10-day
  detection floor, just a less extreme asymmetry).
- **Category 3 (`UNBOUNDED_DISCRETION`)**: always `MEDIUM` - a real gap,
  but bounded in practice by the deposit amount itself.
- **Category 4 (`LAND_USE_CONTRADICTION`)**: always `HIGH` - land-use
  misclassification can carry regulatory/conversion consequences, not
  just a contractual one.
- **Category 5 (`MISSING_CLAUSE`)**: depends on *which* clause type is
  missing (`MISSING_CLAUSE_SEVERITY` in `pass1PerClause.ts`) -
  `SECURITY_DEPOSIT`/`LEASE_PREMIUM`/`TERMINATION`/`LEASE_DURATION`/`RENT_PAYMENT`
  are `HIGH` (a materially bigger, document-specific gap);
  `DISPUTE_RESOLUTION`/`JURISDICTION`/`LAND_USE_RESTRICTION` are `MEDIUM`
  (real gaps, but ones Indian courts often fill by default rule).

## Evidence design

Every `RiskFinding` carries an `evidence: EvidenceSpan[]` array (`apps/api/src/risk/types.ts`),
each entry recording `sourceTable` (`"document_clauses"` or
`"entities"`), `sourceId`, `documentId`, `textStart`/`textEnd`, and a
copy of the source text at persistence time. This is deliberately an
*array*, not a single span, because Pass 2 findings are provenanced to
**every** clause/entity actually compared, not just one:

- Category 2 evidence always has exactly 2 entries, both
  `document_clauses` (the two compared `NOTICE_PERIOD` clauses).
- Category 4 evidence always has exactly 2 entries, one `entities` (the
  `LAND_USE_TYPE` entity) and one `document_clauses` (the
  `LAND_USE_RESTRICTION` clause).
- Category 5 (missing-clause) evidence is always empty - there is no
  clause to anchor to, which is the entire point of "clean absence." The
  finding is document-level.

The persisted `Risk` row also duplicates the *first* evidence span's
`textStart`/`textEnd` as top-level columns (see `schema.prisma`'s comment
on the `Risk` model) purely as a convenience for simple range-based
filtering/sorting - the full, authoritative provenance is always the
`evidence` JSON array, never those two convenience columns alone.

## Comparison-check registry (Pass 2 extensibility)

```ts
export interface ComparisonCheck {
  name: string;
  run(context: RiskEngineContext): RiskFinding[];
}

export const COMPARISON_CHECKS: ComparisonCheck[] = [
  asymmetricObligationCheck,
  landUseContradictionCheck,
];

export function runPass2(
  context: RiskEngineContext,
  checks: ComparisonCheck[] = COMPARISON_CHECKS,
): RiskFinding[] {
  return checks.flatMap((check) => check.run(context));
}
```

Adding a new cross-clause/cross-entity check is: write a function
matching `ComparisonCheck`, push it into `COMPARISON_CHECKS`. Nothing
about `pass1PerClause.ts`, `runRiskEngine.ts`, or any existing check needs
to change. `runPass2`'s optional second parameter (defaulting to the
registry) exists specifically so this is testable in isolation -
`apps/api/tests/riskEnginePass2.test.ts`'s "Pass 2 registry extensibility"
test constructs a throwaway `ComparisonCheck`, calls
`runPass2(context, [throwawayCheck])` directly, and asserts it ran while
the module's own `COMPARISON_CHECKS` array is provably untouched
(`COMPARISON_CHECKS.some((c) => c.name === "throwaway_test_check")` is
`false`) - proof the mechanism doesn't require editing Pass 1 or the
default registry to extend Pass 2.

The pattern mirrors Phase 4A's rule-based NER pattern registry
deliberately - both are "a list of independent, individually-testable
detectors run over a shared input," just at a different granularity
(regex-over-text vs. function-over-document-context).

## Framing rule, enforced in generated text

Every `reason` string uses "may be a potentially [unfavorable/significant]
X and warrants review before signing" framing - never a definitive legal
judgment ("is illegal", "is invalid", "is void", ...).
`apps/api/src/risk/reasonFraming.ts` exports `containsDefinitiveJudgment()`
and a `FORBIDDEN_PHRASES` list; `apps/api/tests/reasonFraming.test.ts`
doesn't just eyeball the templates - it runs `runPass1`/`runPass2` against
real fixture contexts and asserts every *actual generated* `reason` string
fails `containsDefinitiveJudgment()`, so a future edit that concatenates
something unreviewed into a reason string would be caught by the test, not
just missed by inspection.

## API surface

`GET /documents/:id/risks` (`apps/api/src/routes/documents.ts`) -
ownership-scoped via the same `findOwnedDocumentId` helper every other
`:id`-scoped route uses, returns all persisted `Risk` rows for the
document (every `model_source` that has run, same convention as
`GET /documents/:id/entities`). No dedicated frontend risk panel this
phase - out of scope per the Phase 6 build prompt.

## `key_findings` reservation, not population

`Document.keyFindings.flagged_risks` / `.missing_clauses` (the Phase 1-2
schema fields) are reserved for a later phase to populate from `Risk`
rows - this phase does not write to `key_findings` at all. Full
`key_findings` population (`summary`, `critical_terms`) is explicitly out
of scope here.

## Pipeline integration

`risk_engine` runs as the final stage in `apps/api/src/jobs/pipeline.ts`'s
`runPipelineStages`, after `clause_classification` - it needs both
entities and clauses to already be persisted. It does not depend on
`generic_transformer_ner`'s output (that stage's own, pre-existing,
documented Phase 4A/4B failure mode - see `evaluation_results.md` - has no
effect on `risk_engine`, which reads `RULE_BASED` clauses/entities by
default regardless of what other `model_source`s did or didn't produce).
