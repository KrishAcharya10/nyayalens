# Evaluation design: document-level separation (standing rule)

**No ML training or evaluation code exists in Phase 1-2.** This document
is written now, before any such code exists, so that every future
evaluation script is built correctly from the start rather than needing a
rewrite after leakage is discovered in a reported result.

## The rule

Cross-validation must operate at the **source-document level**, never at
the chunk/sentence/clause/page level.

- All derived samples from the same source document — its entities, its
  clauses, its pages, its embeddings, any chunk produced from it — must
  stay together in the same fold.
- The same source document must never contribute samples to both a
  training fold and a validation/test fold within the same run. Clauses
  or pages from one legal document are highly correlated with each other
  (same drafting style, same party names, same template); splitting them
  across folds leaks information from train into test and inflates
  reported performance in a way that will not replicate on genuinely
  unseen documents.
- Prefer `sklearn.model_selection.StratifiedGroupKFold`, with
  `group = document_id` and `stratification = document_type`
  (`residential_rental` / `land_lease`), wherever technically feasible.
- Report results as **mean ± standard deviation across folds**. A single
  fold's number is not a reportable result on its own.

## Why the schema already supports this

Every table that will hold a derived sample (`document_pages`,
`document_sections`, `document_clauses`, `entities`, `relations`,
`risks`, `obligations`, `embeddings`) carries a `document_id` foreign key
back to `documents` (see `database.md`). A future evaluation script can
therefore always recover the owning document — and hence the correct
group and stratification label — for any row, without a schema change.

## This applies to the real dataset too, and matters more there

This rule is not specific to the 300-document synthetic set. It applies
identically once the ~30-document real dataset (15 residential rental +
15 land lease, target size — not yet collected as of Phase 1-2) is used
for evaluation. With only ~15 documents per type, a single leaked
document has an outsized effect on any reported metric — small document
counts make this rule **more** important, not less, because there is much
less room for a leak to be diluted away by volume.

## Synthetic vs. real results must never be blended

- Synthetic-only performance must never be reported or implied as
  evidence of real-world generalization (per
  `research/data/synthetic/dataset_card.md`: "This dataset should be used
  for bulk training only. Reported evaluation metrics should be computed
  on the separate real-document test set, not on a held-out split of
  this synthetic set alone.").
- Wherever a future report, dashboard, or log shows both synthetic and
  real-document results together, they must be visually and textually
  separated (e.g. distinct sections, an explicit "SYNTHETIC" /
  "REAL" label on every number), never merged into one aggregate
  statistic.
- This is why `documents.is_synthetic` exists as a first-class,
  non-nullable boolean rather than something inferred from a filename
  convention — every downstream query that touches `documents` can and
  must filter or group on it explicitly.

## Nothing in this phase computes or reports a metric

No accuracy, F1, precision/recall, or any other performance number is
computed anywhere in Phase 1-2's code, tests, or seed script output. The
seed script (`packages/db/src/seed.ts`) only prints row counts (e.g. "150
residential_rental, 150 land_lease"), always prefixed `[SYNTHETIC]` — a
count of rows loaded is not a research finding and cannot be mistaken for
one, but the prefix is kept anyway for consistency with the rule above.
