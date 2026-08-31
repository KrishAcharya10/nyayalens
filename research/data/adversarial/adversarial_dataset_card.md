# NyayaLens Adversarial Test Set Card

## Provenance
- **Source**: Fully synthetic, template-generated (NOT scraped or derived from real documents)
- **Generator**: nyayalens/research/generator/adversarial_generator.py + generate_adversarial_batch.py
- **Generated on**: 2026-08-31T10:08:50.573141+00:00
- **Design note**: docs/research/adversarial_test_design.md
- **License**: No license restrictions (originally generated for this project)

## Composition
- Total documents: 150
- Adversarial (positive) cases: 75
- Matched controls (expected_flag=None): 75
- Categories: liability_shift, asymmetric_obligation, unbounded_discretion, land_use_contradiction, missing_clause

## Purpose
Tests the Phase 6 risk engine against genuinely hard cases - no alarming
vocabulary, no obviously-wrong-looking text - per
docs/research/adversarial_test_design.md. Every document has an
`expected_flag` in its `.labels.json` (category, detail, is_control) for
automatic grading; see research/adversarial_evaluation.py.

## Known limitations (report these honestly)
- This dataset is entirely synthetic and template-generated, same
  limitations as research/data/synthetic/dataset_card.md.
- Categories 1 (liability shift) and 3 (unbounded discretion) only cover
  residential_rental; category 4 (land use contradiction) only covers
  land_lease - see docs/architecture/risk_engine.md's scoping note for why.
- This dataset must never be used to train/fine-tune any model - it exists
  solely to evaluate the risk engine, and is kept distinctly tagged
  (`is_adversarial=true` in the database) from the bulk training set.
