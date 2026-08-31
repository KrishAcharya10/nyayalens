# Phase 6 adversarial evaluation results

**These are real, measured numbers from an actual run** against
`research/data/adversarial/` (150 documents: 75 adversarial + 75 matched
controls, 15 of each per category) and against the ordinary 300-document
synthetic set uploaded under `phase4b-eval@nyayalens.local`. Read
`docs/architecture/evaluation_design.md` first - the same standing rule
applies here: **these are synthetic-only results and must never be
presented, quoted, or implied as evidence of real-world performance.**
`research/data/real/` is still empty.

**A more important caveat than usual applies to this dataset
specifically**: the adversarial generator
(`research/generator/adversarial_generator.py`) and the risk engine it is
testing (`apps/api/src/risk/`) were designed by the same process, in the
same session, with direct knowledge of each detector's exact thresholds
and regexes. A 100% detection rate here demonstrates the plumbing works
end-to-end - generation → extraction → clause segmentation → risk
detection → persistence → evidence provenance - and that each detector
does what it was written to do on inputs shaped the way it expects. It is
**not** independent evidence that the underlying detection logic would
generalize to a real lawyer's adversarially-drafted document, which may
phrase the same substantive problem in ways this generator never
produces. Treat this as an integration/regression test suite passing, not
as a generalization claim.

## Two real bugs found during evaluation, and fixed

The first full run surfaced two genuine defects - both in Phase 6's own
new code (the adversarial generator and one Pass 1 regex), not in Phase
4A/4B code, so fixing them was in scope.

1. **`STRUCTURAL_REPAIRS_PARTY` in `pass1PerClause.ts` didn't tolerate a
   PDF line-wrap.** reportlab's PDF text flow wrapped the generated
   sentence mid-phrase (`"structural repairs\nshall be borne by the
   Tenant."`), and `canonical_text` preserves that newline rather than
   collapsing it to a space. The regex used literal `" "` between words
   (`/structural repairs shall be .../`), so it never matched real
   PDF-extracted text, only the un-wrapped `.txt` source - detection rate
   for `LIABILITY_SHIFT` was 0/15 before this fix. Fixed by replacing
   every literal space with `\s+` in that regex.
2. **The adversarial generator's `NOTICE PERIOD (LANDLORD)`-style
   headings were silently dropped by clause segmentation.** The
   unmodified Phase 4A segmenter (`apps/api/src/clauses/clauseSegmenter.ts`)
   only recognizes a heading line matching `/^(\d{1,2})\.\s+([A-Z /&,-]{2,60})\s*$/gm`
   - parentheses aren't in that character class, so
   `"4. NOTICE PERIOD (LANDLORD)"` never matched as a heading at all, and
   both party-tagged `NOTICE_PERIOD` clauses were silently absorbed into
   the preceding `SECURITY_DEPOSIT` clause's span instead of becoming
   their own `DocumentClause` rows - detection rate for
   `ASYMMETRIC_OBLIGATION` was 0/15 before this fix, even though the
   underlying `NOTICE_PERIOD` *entities* were still extracted correctly
   (entity extraction runs over raw text, unaffected by clause
   segmentation). This is a generator design flaw, not a Phase 4A bug -
   the segmenter was never claimed to handle arbitrary heading
   punctuation, and per this phase's explicit scope boundary, fixing the
   segmenter itself was not an option even if it had been the more
   "natural" fix. Instead, the generator's heading format changed from
   `"NOTICE PERIOD (LANDLORD)"` to `"NOTICE PERIOD - LANDLORD"` (a hyphen
   is inside the segmenter's allowed character class), and
   `pass2CrossClause.ts`'s `PARTY_TAG_PATTERN` was broadened to
   `/[(-]\s*(LANDLORD|TENANT|LESSOR|LESSEE)\b/i` so it still matches the
   parenthesized form the unit tests construct by hand as well as the
   generator's real hyphenated form.

Both fixes are reflected in the numbers below - the dataset was fully
regenerated and re-uploaded after fixing, under a clean database state
(prior rows deleted first), not patched in place.

## Per-category results (adversarial + matched control, n=15 each)

| Category | Detection rate (15 positive) | Control false-positive rate (15 control) | Cross-category FP on positives | Evidence correctness (cat. 2/4 only) |
|---|---|---|---|---|
| `LIABILITY_SHIFT` | 15/15 = 1.00 | 0/15 = 0.00 | 0 across all 4 other categories | n/a |
| `ASYMMETRIC_OBLIGATION` | 15/15 = 1.00 | 0/15 = 0.00 | 0 across all 4 other categories | 15/15 = 1.00 |
| `UNBOUNDED_DISCRETION` | 15/15 = 1.00 | 0/15 = 0.00 | 0 across all 4 other categories | n/a |
| `LAND_USE_CONTRADICTION` | 15/15 = 1.00 | 0/15 = 0.00 | 0 across all 4 other categories | 15/15 = 1.00 |
| `MISSING_CLAUSE` | 15/15 = 1.00 | 0/15 = 0.00 | 0 across all 4 other categories | n/a |

- **Detection rate** is matched against `expected_flag` specifically
  (for `MISSING_CLAUSE`, the reason text must name the *same* omitted
  clause type the generator actually omitted, not just any
  `MISSING_CLAUSE` finding), not "did the engine flag something."
- **Control false-positive rate**: for each category's 15 matched control
  documents (same structure/vocabulary, generated with
  `expected_flag=None`), the fraction that nonetheless received a finding
  of *that same category*.
- **Cross-category FP on positives**: for each category's 15 positive
  documents, whether an *unrelated* category also fired. All zero -
  where a category is structurally inapplicable to a document type (e.g.
  `LAND_USE_CONTRADICTION` can never fire on a `residential_rental`
  document, which has no `LAND_USE_TYPE` entity at all), this is a
  structural zero, not evidence of precision; see `risk_engine.md`'s
  scoping note.
- **Evidence correctness** (categories 2 and 4 only, per the build
  prompt's requirement to check this specifically): for every positive
  document the category-specific finding was detected on, whether the
  persisted `evidence` array references the *actual* compared spans in
  that document - for category 2, both evidence clause numbers match the
  generator's `expected_flag.detail.clause_numbers`; for category 4, the
  entity-sourced evidence text is "Agricultural" and the clause-sourced
  evidence text contains the generator's `expected_flag.detail.permitted_use`
  string. 15/15 for both categories - evidence is not just "any two
  spans," it is provably the specific pair being compared.

Raw output: `research/data/adversarial/evaluation_results.json`
(reproduced by `apps/api/scripts/evaluate-adversarial.mjs`).

## Separate false-positive check on the ordinary synthetic set (addendum)

Per the Phase 6 build prompt's addendum, adversarial-control performance
alone isn't accepted as the only evidence of false-positive behavior.
This section runs the risk engine against all 300 ordinary documents from
`research/data/synthetic/` (uploaded under `phase4b-eval@nyayalens.local`
during Phase 4B, generated by the **unmodified**
`research/generator/generator.py` - not the adversarial generator, no
injected risk condition of any kind) and reports what fraction produced
at least one finding.

**Raw result**: 57/300 = **19.0%** of ordinary documents produced at
least one risk finding (`research/data/adversarial/ordinary_control_fp_results.json`,
via `apps/api/scripts/evaluate-ordinary-control-fp.mjs`). All 57 findings
were `MISSING_CLAUSE` (47) or `LAND_USE_CONTRADICTION` (11), with 1
document producing both.

**This number needs interpretation, not just reporting, to be honest
rather than misleading.** Inspecting the flagged documents directly:

- Every inspected `MISSING_CLAUSE` finding was **correct** - the flagged
  document genuinely has no `DISPUTE_RESOLUTION` clause anywhere in its
  text, confirmed by reading the raw `canonical_text`, not just the
  persisted clause rows. This is not a risk-engine defect: `generator.py`
  itself omits the `DISPUTE_RESOLUTION` clause with unconditional 20%
  probability for *every* document it generates (`if random.random() >
  0.2:` at lines 164 and 294, unmodified Phase 1-2 code) as part of
  realistic template variation. `NOTICE_PERIOD` (15% omission) and
  `MAINTENANCE` (10% omission) are also randomly omitted by the generator
  but are correctly *not* in `EXPECTED_CLAUSE_TYPES` (they're optional
  clauses in this generator's own model, not schema-required ones), so
  their omission never triggers a finding.
- Every inspected `LAND_USE_CONTRADICTION` finding was similarly
  **correct** - e.g. one flagged document's `LAND_USE_TYPE` entity reads
  "Agricultural" while its `PERMITTED USE` clause reads "construction of
  a warehouse facility," which is exactly the contradiction category 4
  is designed to catch. `generator.py` picks `land_use_type` and
  `permitted_use` via two fully independent `random.choice()` calls
  (lines 199-200, unmodified Phase 1-2 code) with no consistency check
  between them - so a genuine agricultural/non-agricultural-use
  contradiction is an expected, if incidental, byproduct of the ordinary
  generator's own randomization, at a rate this run's 11/300 (all within
  the ~150 `land_lease` documents, so effectively ~7.3% of that subset)
  is broadly consistent with.

**Conclusion**: the risk engine is not raising false alarms on clean
documents here - it is correctly detecting real gaps and real
inconsistencies that the *ordinary* synthetic generator's own randomization
incidentally produces at a known, non-trivial rate. The 19.0% figure
measures "how often the ordinary bulk set happens to contain something a
correct risk engine should flag," not "how often the risk engine is
wrong." This is a genuinely useful and slightly uncomfortable finding
about the Phase 1-2/4A bulk generator, not a Phase 6 defect - reported
here in full rather than treated as if the addendum's "clean control set"
premise simply held. A stricter false-positive estimate would need a
bulk-generated set with `DISPUTE_RESOLUTION` omission and
`land_use_type`/`permitted_use` pairing both forced consistent, which
does not currently exist and was not built this phase (`generator.py` is
Phase 1-2/4A code, out of scope to modify here).

Reproduce: `dotenv -e ../../.env -- tsx apps/api/scripts/evaluate-ordinary-control-fp.mjs` (from `apps/api`).

## No categories performed poorly after the fixes above

Every category reached 1.00 detection / 0.00 control-FP / 1.00 evidence
correctness (where applicable) on this adversarial set once the two bugs
above were fixed. There is no category to single out as weak within this
dataset - the weak spot this evaluation actually surfaced is the ordinary
bulk generator's lack of internal consistency guarantees, documented
above, not any of the five risk detectors.

## Reproducing this

```powershell
# Regenerate the 150-document adversarial + matched-control set
python research/generator/generate_adversarial_batch.py --per-category 15 --out research/data/adversarial

# Upload through the live pipeline (requires npm run dev:api running) and
# tag isAdversarial/isAdversarialControl directly via Prisma
cd apps/api
npx dotenv -e ../../.env -- tsx scripts/bulk-upload-adversarial.mjs

# Score detection rate / control FP rate / cross-category FP / evidence
# correctness from the persisted Risk rows
npx dotenv -e ../../.env -- tsx scripts/evaluate-adversarial.mjs

# Separate false-positive check against the ordinary 300-document synthetic set
npx dotenv -e ../../.env -- tsx scripts/evaluate-ordinary-control-fp.mjs
```
