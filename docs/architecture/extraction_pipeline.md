# Extraction pipeline (Phase 4A)

Covers OCR, rule-based NER, the generic-transformer NER baseline, and
clause classification - everything that turns Phase 3's canonical text
into structured `entities`/`document_clauses` rows. Fine-tuning and
formal evaluation are Phase 4B (`evaluation_results.md`); this document
describes what actually runs, not projected results.

## Pipeline stages (in order)

Added to `apps/api/src/jobs/pipeline.ts#runExtractionPipeline`, each its
own `ProcessingJob` row (see `document_ingestion.md` for the job
infrastructure itself, unchanged in this phase):

1. `text_extraction` (Phase 3) - unchanged.
2. `ocr` - runs only if `text_extraction` left any `DocumentPage` with
   `extraction_method: null` (a scanned/image-only PDF page). No-op
   otherwise, including for every DOCX (DOCX pages are always native).
3. `rule_based_ner` - always runs, over the final `canonical_text`
   (after OCR, if any ran).
4. `clause_classification` - always runs, same input.
5. `generic_transformer_ner` - runs if `ML_SERVICE_PYTHON` is configured
   (see `services/ml/README.md`); recorded `FAILED` with a clear reason
   otherwise, without aborting the pipeline (rule-based NER and clause
   classification don't depend on it).

A stage failure stops *later* stages but does not undo earlier ones - see
`runStage`/`runExtractionPipeline` in `pipeline.ts`.

## OCR

`apps/api/src/ocr/`:

- **Rasterization** (`rasterizePdfPage.ts`): `pdfjs-dist` renders the PDF
  page at 2x scale (~150dpi) into an `@napi-rs/canvas` canvas, exported
  as a PNG buffer. `@napi-rs/canvas` was chosen over the more common
  `canvas` package because it ships prebuilt native binaries (no C++
  toolchain needed on the host) - relevant since this project's dev
  environment has no build tools installed.
- **Recognition** (`runOcr.ts`): `tesseract.js`, one shared worker
  process reused across pages/documents (creating a worker per call would
  re-download/re-init the language model every time).
- Each OCR'd page gets `extraction_method: "OCR"` and `ocr_confidence`
  (Tesseract's own confidence score, 0-1). `Document.canonical_text` is
  re-joined from every page (native + OCR) after the stage completes.
- **No synthetic scanned documents exist** - all 300
  `research/data/synthetic/` PDFs are generated with embedded text
  (reportlab), so none exercise the OCR path. A single test fixture,
  `apps/api/tests/fixtures/sample_blank_scanned.pdf` (a genuinely
  blank/textless PDF page, built with reportlab for this purpose), is
  used in `apps/api/tests/documents.test.ts` to prove the
  native-text-vs-OCR boundary is set correctly. OCR *recognition
  quality* on genuinely scanned real-world documents is untested - there
  is no ground truth to test it against yet, since `research/data/real/`
  is still empty.

## Rule-based NER (`model_source: rule_based`)

`apps/api/src/ner/rulePatterns.ts`. A registry of named patterns, not
inline regex scattered through the codebase - see the file for the full
list. Grounded in `research/generator/value_pools.py`'s actual surface
forms (exact formats: `₹128,000`, `1.29 acres`, `328/B`, `20 years`,
`60 days`), so it's genuinely testable against synthetic ground truth
(`apps/api/tests/ruleBasedNer.test.ts`), not guessed.

Covers: `DURATION`, `SURVEY_NUMBER`, `LAND_AREA`, `LAND_USE_TYPE`,
`LANDLORD`/`TENANT`/`LESSOR`/`LESSEE` (party names), `ADDRESS`,
`NOTICE_PERIOD`, and the three amount types (`RENT`, `SECURITY_DEPOSIT`,
`LEASE_PREMIUM` - see "Context-dependent amounts" below). Two entity
types requested beyond the generator's actual ontology,
`KHATA_NUMBER` and `EASEMENT_RIGHT`, have patterns too, but are
**untested against synthetic ground truth** - no synthetic document
contains either concept, so their regexes are only as good as they look
on paper. Flagging this explicitly rather than implying they're verified.

### Context-dependent amounts

`RENT`, `SECURITY_DEPOSIT`, and `LEASE_PREMIUM` all share one surface
form (a currency amount) - the same digit pattern cannot be a single
regex per label, since nothing about the digits themselves says which
one it is. `extractAmountEntities` finds every amount, then looks at the
~80 characters *before* it for a keyword (`deposit`, `premium`, `rent`)
to decide the label - and **skips** the amount entirely if none matches,
rather than fabricating a label. Order in `AMOUNT_KEYWORDS` matters only
in the pathological case of two keywords in the same window; in the
synthetic dataset this never happens.

### A real PDF-extraction bug this surfaced

The first version of this pattern required a literal `₹` character. It
failed on the real PDF fixture (`sample_residential_rental.pdf`) because
**pdfjs-dist decoded the ₹ glyph as a stray "n"** for that PDF's font
encoding - `"remit a sum of   n 10,500 per month"` instead of `"...₹10,500..."`.
This is a genuine PDF text-extraction quality issue (font/glyph-mapping
dependent, not something this codebase controls), not a bug in the NER
logic. The fix: `AMOUNT_REGEX` now matches *either* a `₹`-prefixed amount
(preferred - keeps the span identical to ground truth's format when the
symbol survives extraction) *or* a bare Indian-style comma-grouped number
as a fallback (`10,500`, `1,92,000`) when it doesn't. This is documented
here rather than silently patched because it's a real, reportable finding
about PDF extraction reliability for Indian Rupee amounts specifically -
relevant to anyone processing real (not synthetic) Indian legal PDFs.

## Generic-transformer NER baseline (`model_source: generic_transformer`)

`services/ml/baseline_ner.py`, invoked as a subprocess from
`apps/api/src/ner/genericTransformerNer.ts`. Model: `dslim/distilbert-NER`
(CoNLL-2003 PER/ORG/LOC/MISC) - stock, pretrained, **not** legal-domain,
**not** fine-tuned on any NyayaLens data. That's the point: it's the
second baseline Phase 4B's evaluation compares against rule-based (and
later, the fine-tuned model).

**Labels are passed through as the model's own vocabulary, prefixed
`GENERIC_`** (`GENERIC_PER`, `GENERIC_LOC`, ...) - never force-mapped
into NyayaLens's domain ontology (e.g. `GENERIC_PER` is never rewritten
to `LESSOR`). The model has no way to know which party role a person
belongs to; relabeling it would fabricate information the model never
produced.

### An observed weakness, reported honestly

Testing this baseline against Indian names surfaced fragmented output:
`"Zaid Banik"` was split into two separate entity groups, `"Z"` and
`"##aid Banik"`, instead of merging into one span, even with
`aggregation_strategy="simple"`. This looks like the model's subword
tokenizer/aggregation not handling this name well - plausible, since
CoNLL-2003 (the model's training data) is English-language Reuters news
text with few Indian names. This was **not** patched with custom
merging logic in Phase 4A - hand-tuning the baseline's output would
blur the line between "baseline" and "adapted model," which is exactly
what Phase 4B's fine-tuning is for. It's left as-is and will show up as
a real (and informative) weakness in Phase 4B's per-model-source
evaluation numbers.

### Why this stage is opt-in, not always-on

Every subprocess invocation reloads PyTorch and the model from disk -
observed at ~12-13 seconds for a single small document in this
environment. Running it on every upload by default would make routine
development (and the automated test suite) slow for a baseline that's
optional in most workflows. `ML_SERVICE_PYTHON` (empty by default, see
`.env.example`) gates it; `apps/api/tests/documentsEntitiesClauses.test.ts`
has a dedicated `it.skipIf(!env.ML_SERVICE_PYTHON)` test that verified it
end-to-end (a one-off manual run with the venv configured - see the
Phase 4A report), but it does not run as part of the default `npm test`.

## Clause classification (`model_source: rule_based`)

`apps/api/src/clauses/`: `clauseSegmenter.ts` splits `canonical_text` on
numbered, capitalized heading lines (`"1. LEASE DURATION"`) - a clause
span runs from one heading to the next (or end of text), which is
*exactly* how `research/generator/generator.py`'s `BuiltDocument.start_clause`/
`end_clause` define ground-truth clause spans, making this segmentation
directly comparable in Phase 4B evaluation. `clauseTaxonomy.ts` then
classifies each heading by keyword pattern against the ontology
(`LEASE_DURATION`, `RENT_PAYMENT`, `SECURITY_DEPOSIT`, `NOTICE_PERIOD`,
`MAINTENANCE`, `TERMINATION`, `DISPUTE_RESOLUTION`, `JURISDICTION`,
`LEASE_PREMIUM`, `LAND_USE_RESTRICTION`, `ENCUMBRANCE_DECLARATION` - all
from the actual generator - plus `CROP_OR_CULTIVATION_RIGHTS`, an
extension **untested against synthetic ground truth** since no synthetic
document contains it).

### Two real, documented limitations

1. **Segmentation depends entirely on numbered all-caps headings.** A
   real document using lowercase headings, roman numerals, or no
   headings at all will segment poorly or not at all. This is not a bug
   to special-case around - it's a genuine baseline limitation to
   improve on later (with the `research/data/real/` documents, once
   collected).
2. **The last clause's span always extends to the end of the extracted
   text.** There is no "next heading" to bound it against, so it
   swallows trailing boilerplate (`"IN WITNESS WHEREOF..."`) that isn't
   part of any clause in ground truth. This costs one clause
   (`JURISDICTION`, always last in the generator's documents) per
   document in the sanity-check tests
   (`apps/api/tests/ruleBasedClauseClassifier.test.ts`, thresholds set
   to reflect this honestly rather than hiding it). Trimming specifically
   for `"IN WITNESS WHEREOF"` was deliberately not done - it would
   overfit the segmenter to this dataset's exact boilerplate phrase
   rather than fixing the general problem.

## Idempotency

Every stage that writes entities/clauses deletes its own prior rows for
that `(documentId, modelSource)` pair before inserting - so re-running
the pipeline (e.g. via the startup recovery job, `jobs/recovery.ts`)
never duplicates rows. `DocumentPage` upserts by `[documentId,
pageNumber]`, unchanged from Phase 3.

## API endpoints

`GET /documents/:id/entities`, `GET /documents/:id/clauses` -
owned-by-caller only (`404` if not, matching the rest of `documents.ts`).
Both return every `model_source` that has run for that document together
- callers filter client-side if they want just one.

## Synthetic pipeline validation (correctness only, not metrics)

`apps/api/scripts/validate-extraction-sample.mjs` uploads a sample of
real synthetic documents through the live API and confirms
`text_extraction`, `rule_based_ner`, and `clause_classification` all
reach a terminal, non-`FAILED` state (`generic_transformer_ner` is
excluded from the pass/fail verdict, since it's optional). Run:

```powershell
npm run dev:api   # in one terminal
node apps/api/scripts/validate-extraction-sample.mjs 10   # 10 per doc type = 20 total
```

Result from the last run (20/20 documents, 10 residential_rental + 10
land_lease): every document completed all three stages without a
failure, in ~340ms each after the first (model/JIT warmup). Entity
counts ranged 6-9 and clause counts 6-8 per document - plausible given
each document has 6-8 ground-truth entities/clauses (see
`research/data/synthetic/dataset_card.md`). **These are pipeline-run
counts, not accuracy numbers** - the script does not compare against
ground truth. Formal precision/recall/F1 (with k-fold cross-validation)
is Phase 4B's job; see `evaluation_results.md` once it exists.
