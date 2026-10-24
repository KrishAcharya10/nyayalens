# Anomaly Benchmark v2 - baseline and updated results

> Fictional synthetic documents. These numbers are **not** a measure of accuracy on real agreements, and every finding is a review prompt, not a legal conclusion or a statement about enforceability. Figures are generated from `research/data/reports/anomaly_v2_*.json` by `apps/api/scripts/anomaly-v2-report.mjs`.

## What was measured

14 fixture documents (7 flawed, 7 clean controls) in `apps/api/tests/fixtures/anomaly_v2/documents`, with the answer key in `ground_truth.json` (never read by the system): 17 expected findings and 40 questions (fact, conflict, unanswerable, liability cap). A second **held-out** set of 6 documents (`heldout/`) was written after the main fixes.

Matching: a predicted finding matches an expected one when it is on the same document, its category is accepted, and its cited evidence contains every required string. One predicted finding matches at most one expected finding; unmatched predictions are false positives (every finding on a clean control is one). The pack's expected-clause checklist ("No X clause was found") is scored separately, against each document's list of clauses that really are absent. A conflict question is correct only if the answer contains every conflicting value and each value has its own citation; an unanswerable question is correct only if the status is NOT_SUFFICIENT.

Only the rule-based engine is evaluated. The transformer NER stage is unavailable here (`ML_SERVICE_PYTHON` is not set) and no LLM is configured (extractive answerer only), so no model scores exist and none are claimed.

## Results

| Run                                            | Anomaly P / R / F1 | Clean controls with a finding | Documents fully correct | Checklist P / R | Fact  | Conflict | Unanswerable | Liability cap |
| ---------------------------------------------- | ------------------ | ----------------------------- | ----------------------- | --------------- | ----- | -------- | ------------ | ------------- |
| Main set, baseline (before any fix)            | 0.60 / 0.35 / 0.44 | 2/7                           | 1/14                    | 0.11 / 1.00     | 18/23 | 0/8      | 10/12        | 1/4           |
| Main set, updated                              | 1.00 / 1.00 / 1.00 | 0/7                           | 14/14                   | 1.00 / 1.00     | 23/23 | 8/8      | 12/12        | 4/4           |
| Held-out set, first run (after the main fixes) | 1.00 / 0.67 / 0.80 | 0/3                           | 3/6                     | 0.25 / 1.00     | 9/10  | 3/3      | 3/3          | 1/3           |
| Held-out set, after fixing what it exposed     | 1.00 / 1.00 / 1.00 | 0/3                           | 6/6                     | 1.00 / 1.00     | 10/10 | 3/3      | 3/3          | 3/3           |

The main set was used while the fixes were built, so its updated row is a development result, not evidence of generalisation. The held-out first run is the only row that was not tuned on; it exposed real gaps (below), and its "after" row is again a development result. Perfect scores on sets this small, written by the team that wrote the rules, should be read accordingly.

### Main set by document family (updated)

| Family     | TP  | FP  | FN  | F1   |
| ---------- | --- | --- | --- | ---- |
| rental     | 4   | 0   | 0   | 1.00 |
| land_lease | 3   | 0   | 0   | 1.00 |
| sale       | 3   | 0   | 0   | 1.00 |
| employment | 3   | 0   | 0   | 1.00 |
| nda        | 2   | 0   | 0   | 1.00 |
| services   | 2   | 0   | 0   | 1.00 |

### Main set by anomaly category (detected, baseline then updated)

| Category                        | Baseline | Updated |
| ------------------------------- | -------- | ------- |
| conflicting_rent                | 1/1      | 1/1     |
| missing_deposit_refund_deadline | 0/1      | 1/1     |
| notice_asymmetry                | 1/1      | 1/1     |
| date_chronology                 | 1/1      | 1/1     |
| property_identifier             | 1/2      | 2/2     |
| property_area                   | 1/1      | 1/1     |
| duration_vs_dates               | 0/1      | 1/1     |
| price_arithmetic                | 1/1      | 1/1     |
| possession_before_agreement     | 0/1      | 1/1     |
| ctc_arithmetic                  | 0/1      | 1/1     |
| probation_conflict              | 0/1      | 1/1     |
| bonus_conflict                  | 0/1      | 1/1     |
| confidentiality_duration        | 0/1      | 1/1     |
| retention_conflict              | 0/1      | 1/1     |
| payment_deadline                | 0/1      | 1/1     |
| uncapped_indemnity              | 0/1      | 1/1     |

## What the held-out run exposed

- The tolerance for "stated term vs dates" was too loose (a 12-month term over 11 months of dates passed).
- "indemnity" (the noun) was not recognised as an indemnity; only "indemnify".
- Liability exceptions worded "Nothing in this clause limits liability for fraud" were not extracted.
- "The monthly fee ... is INR X" was not read as a fee.
- A heading such as "Ending the Tenancy" produced a missing-termination finding, and an advance paid "as advance" a missing-advance finding.
- Two benchmark-side corrections, disclosed: the H3 answer key wrongly listed no absent clause (the document has no confidentiality clause, so the system was right), and on the main set the retention finding's required evidence was changed to the two durations it cites rather than the words "archival copies".

## Fixes

Amount labelling (nearest keyword, stops at the previous amount, no trailing comma), conflict-aware answers with one citation per value, liability limit / exception / uncapped-indemnity answers, a coverage guard that refuses questions about terms the document never mentions, Party A / Party B and Supplier roles, payment-deadline conflicts, CTC component arithmetic (only when the text says the components are the whole), stated term against its dates, return-versus-retention (a review item), a missing deposit-refund deadline (a missing term, not a contradiction), missing-clause findings no longer raised for unfamiliar headings, and "Employer" in the notice-asymmetry check.

No regression on the older synthetic benchmark (`docs/evaluation.md`, seed 2027): all 1,614 compared metrics were unchanged or better after these changes (0 worse).

## Limitations

- Small fixtures written by the same team as the rules; the held-out set has 6 documents.
- Rules are phrase-based; other exception or refund wordings will be missed.
- The retention-versus-return rule flags ordinary "archival copy" carve-outs; it is a review prompt.
- The coverage guard refuses a question that uses a synonym the document does not contain.
- No real agreements, no OCR, no transformer or LLM results.

## Reproduce

```
cd apps/api
npx tsx scripts/evaluate-anomaly-v2.mjs --label latest                 # main set
npx tsx scripts/evaluate-anomaly-v2.mjs --set heldout --label latest   # held-out set
node scripts/anomaly-v2-report.mjs                                     # this report
npm test --workspace=apps/api                                          # includes the three anomaly test files
```

Fixtures are rebuilt with `python tests/fixtures/anomaly_v2/build_fixtures.py [heldout]` (needs python-docx).
