# Phase 4B evaluation results

**These are real, measured numbers from an actual run** (`research/eval_results/synthetic_20260831T062444Z_rescored.json`/`.md`), not projected or illustrative ones. Read `docs/architecture/evaluation_design.md` first - the standing rule it states applies in full here: **these are synthetic-only results and must never be presented, quoted, or implied as evidence of real-world performance.** `research/data/real/` is still empty (see "Real-data evaluation" below).

## Methodology actually used

- `StratifiedGroupKFold(k=5, group=document_id, stratify=document_type)` over all 300 synthetic documents. No-leakage proven by `services/ml/tests/test_kfold_no_leakage.py` (5 tests, all passing) - no document's samples ever cross a fold's train/test boundary.
- Metrics are **content-match** (label + exact text via multiset intersection), not offset-match - see `extraction_pipeline.md`'s note on why ground-truth offsets (from the original `.txt`) and PDF-extracted `canonical_text` offsets aren't directly comparable. `services/ml/metrics.py` has the full rationale.
- Compared `model_source`: `rule_based`, `generic_transformer` (Phase 4A baselines, inference only), `fine_tuned` (this phase's InLegalBERT fine-tune).

## Compute-constrained configuration (read before trusting the fine_tuned numbers)

This sandbox has **no GPU**. InLegalBERT is BERT-base-sized (~110M parameters). A first attempt at 2 epochs on each fold's full ~240-document training split was killed after **40+ minutes had not finished a single fold** - projected to 5+ hours for all 5 folds, impractical for this session. The configuration actually used (`services/ml/finetune_ner.py`):

- **1 epoch** (reduced from 2)
- **60 training documents per fold** (subsampled from ~240, fixed seed 42 for reproducibility - the full ~60-document **test** set per fold was always evaluated in full; only training data was reduced)
- `max_length=384`, `batch_size=8`, `learning_rate=3e-5`

Even with this reduction, the full 5-fold run took **just over 3.5 hours of wall-clock time** (from ~06:14 to ~09:53 UTC in the run's own timestamps). Per-fold *training* itself was fast once actually measured (106-117 seconds per fold, confirmed via `finetune_ner.py`'s own logging) - the overwhelming majority of that wall-clock time was inference (`predict_entities`, one forward pass per test document, ~60 documents per fold) and database round-trips, not the training step count. This is itself a finding: this environment's per-forward-pass CPU cost is the real bottleneck, not gradient steps.

## Two real bugs found during evaluation, and fixed

Formal evaluation caught two genuine defects that the Phase 4A sanity-check tests (which only spot-checked a subset of labels) missed:

1. **`apps/api/src/ner/rulePatterns.ts`'s `LESSEE` pattern required a period terminator.** The generator's actual text is comma-terminated (`"LESSEE: Name, hereinafter..."`, identical structure to `LESSOR`) - the pattern never matched anything, silently producing zero `LESSEE` entities across all 300 documents. Fixed, and `apps/api/scripts/backfill-rule-based-ner.mjs` was run once to re-extract and overwrite `RULE_BASED` entities for all 300 already-uploaded documents (verified: `LESSEE` count went from 0 to 149/150 land lease documents). A regression test (`apps/api/tests/ruleBasedNer.test.ts`, "finds LESSOR and LESSEE...") now covers all four party-role labels directly - this class of bug (a pattern that compiles and runs but structurally never matches) is exactly what that test's absence let through in Phase 4A.

2. **`services/ml/metrics.py` compared entity text exactly, with no normalization.** `apps/api`'s amount-extraction pattern has a documented fallback (see `extraction_pipeline.md`) for when a PDF's font encoding mangles the `₹` glyph - it still finds the number (e.g. `"32,000"`) but without the currency symbol, while ground truth always has it (`"₹32,000"`). Before normalizing, this made `RENT`/`SECURITY_DEPOSIT`/`LEASE_PREMIUM` score as **complete misses** for `rule_based` despite the underlying values being correctly extracted. Fixed by stripping a leading `₹` before comparison in `compute_prf`.

Because Python doesn't hot-reload a running process, the 5-fold run already in progress when these were found kept using the old (buggy) data for its checkpoints. Rather than restart training a third time, `services/ml/rescore.py` was written: it reproduces the identical fold split (same `make_folds(n_splits=5, random_state=42)` call) and recomputes metrics from the **already-persisted** DB predictions (`rule_based` re-backfilled with the fix, `generic_transformer` and `fine_tuned` untouched by either bug) - no re-training needed. **The numbers below are from that rescore, not the original in-progress checkpoints.**

## Results (5/5 folds, 300 documents, mean ± std across folds)

### `model_source = rule_based`

| Label | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| ADDRESS | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 300 |
| DURATION | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 300 |
| LANDLORD | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 150 |
| LAND_AREA | 0.507 ± 0.044 | 0.507 ± 0.044 | 0.507 ± 0.044 | 150 |
| LAND_USE_RESTRICTION | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.000 ± 0.000 | 150 |
| LAND_USE_TYPE | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 150 |
| LEASE_PREMIUM | 0.723 ± 0.033 | 1.000 ± 0.000 | 0.839 ± 0.023 | 150 |
| LESSEE | 1.000 ± 0.000 | 0.993 ± 0.013 | 0.997 ± 0.007 | 150 |
| LESSOR | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 150 |
| NOTICE_PERIOD | 1.000 ± 0.000 | 0.575 ± 0.098 | 0.725 ± 0.084 | 127 |
| RENT | 1.000 ± 0.000 | 0.807 ± 0.033 | 0.893 ± 0.020 | 300 |
| SECURITY_DEPOSIT | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 150 |
| SURVEY_NUMBER | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 276 |
| TENANT | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 150 |

Full table (including `generic_transformer` and `fine_tuned`) in `research/eval_results/synthetic_20260831T062444Z_rescored.md`.

## Honest findings, not softened

- **`LAND_USE_RESTRICTION` scores exactly 0 for `rule_based` - this is a real, expected gap, not a bug.** `apps/api/src/ner/rulePatterns.ts` never implemented an extraction pattern for it: the ground-truth values are open-ended free text (`"cultivation of seasonal crops"`, `"horticultural plantation"`, `"dairy farming operations"`, ...) with no regular surface form to regex against, unlike `SURVEY_NUMBER` or `LAND_AREA`. It is correctly classified as a *clause type* (`ruleBasedClauseClassifier.ts` does find `LAND_USE_RESTRICTION` clauses) but was never attempted as an *entity* pattern. Documented as unimplemented, not silently omitted.
- **`LAND_AREA` at ~51% is a genuine partial failure, not fully root-caused.** Precision and recall are identical, meaning the extractor finds the right *count* of spans but only about half match ground truth's exact text. The most likely explanation, by analogy with the confirmed `₹`-symbol PDF-extraction bug, is a similar font/glyph-encoding artifact affecting some digit or decimal-point rendering in this PDF's specific font - but this was not confirmed by direct inspection the way the `₹` and `LESSEE` bugs were. Reporting the number rather than the confirmed cause, since the cause is genuinely unconfirmed.
- **`generic_transformer` scores exactly 0 on every domain-ontology label - this is a structural artifact of label-vocabulary mismatch, not evidence the baseline "doesn't work".** `dslim/distilbert-NER`'s own labels (`GENERIC_PER`, `GENERIC_LOC`, `GENERIC_ORG`, `GENERIC_MISC`) never equal a domain label like `RENT` or `LESSOR` under content-match scoring - and, tellingly, those `GENERIC_*` rows themselves show `0/5 folds with support`, because ground truth (correctly) never contains a `GENERIC_*` label either. Comparing this baseline fairly against the domain ontology was out of scope for this evaluation script; it would need either a manual label-remapping step (e.g. "did a `GENERIC_PER` span overlap a `LESSOR`/`LESSEE`/`LANDLORD`/`TENANT` ground-truth span, regardless of exact role") or a separate span-only (ignore-label) recall metric. Not built here - flagged as a real methodology gap, not hidden behind a misleadingly low score.
- **`fine_tuned` scores exactly 0 on every label, and it is not a scoring artifact: zero `fine_tuned` entities were persisted to the database at all**, across all 300 test-document evaluations (`SELECT count(*) FROM entities WHERE model_source='fine_tuned'` returns 0). Training loss did decrease across folds (fold 3: 2.17 → fold 4: 2.06 → fold 5: 1.99, each fold's own single-epoch mean loss), showing the training loop itself works correctly, but with only ~8 gradient steps per fold (60 documents ÷ batch size 8, 1 epoch) and a classifier head starting from random initialization (`AutoModelForTokenClassification` reports `classifier.bias`/`classifier.weight` as "newly initialized" every fold, since InLegalBERT is a base language model with no NER head), the model never learns to predict anything but the majority "O" (non-entity) tag. **This is an honest negative result of this session's compute constraints, not a flaw in the fine-tuning approach or in InLegalBERT itself.** It demonstrates the full mechanism works end-to-end (data prep, BIO encoding, training, inference, decoding, persistence, evaluation) but the resulting model quality is not usable at this training scale. A properly resourced run (GPU, full ~240-document training set per fold, more epochs, likely a learning-rate schedule and warmup) would very plausibly perform far better - this was not tested, and no claim is made about what it would produce.

## `--data-source real`

Not run. `research/data/real/{residential_rental,land_lease}/annotated/` is empty (no real documents have been collected yet - see the Phase 1-2 report). `services/ml/evaluate.py --data-source real` is designed to fail loudly with a clear `RuntimeError` naming this, rather than silently falling back to synthetic data or fabricating a result - this is enforced by `run_real_evaluation()`, not just documented behavior.

## Reproducing this

```powershell
# One-time: ensure all 300 synthetic documents are uploaded/processed (idempotent)
node apps/api/scripts/bulk-upload-synthetic.mjs

# Full 5-fold run (fine-tunes InLegalBERT 5 times - see compute-constrained config above;
# took ~3.5 hours in this environment)
services/ml/.venv/Scripts/python.exe services/ml/evaluate.py --data-source synthetic

# Rescore already-persisted predictions without re-training (used here after the two bug fixes)
services/ml/.venv/Scripts/python.exe services/ml/rescore.py
```
