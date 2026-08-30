# NyayaLens Synthetic Dataset Card

## Provenance
- **Source**: Fully synthetic, template-generated (NOT scraped or derived from real documents)
- **Generator**: nyayalens/research/data/synthetic/generate_batch.py
- **Generated on**: 2026-08-30T20:07:34.152130+00:00
- **License**: No license restrictions (originally generated for this project)

## Composition
- Residential rental agreements: 150
- Land lease deeds: 150
- Total documents: 300
- Total labeled entities: 2653
- Total labeled clauses: 2287

## Labeling method
Entities and clauses are labeled via exact character-offset tracking at
generation time (string-template construction), NOT via post-hoc NER or
string matching. Every span in `<doc_id>.labels.json` is verified against
the source text at generation time (see `verify_offsets()` in generator.py).
Labels are therefore exact by construction, not approximate.

## Known limitations (report these honestly in the research writeup)
- Synthetic phrasing is drawn from a fixed set of template variants per
  clause type (5-8 variants each). Real documents will show more lexical
  and structural variation than this dataset captures.
- Entity value distributions (rent ranges, land areas, etc.) are drawn from
  hand-picked realistic ranges, not sampled from real document statistics.
- This dataset should be used for **bulk training only**. Reported
  evaluation metrics should be computed on the separate real-document
  test set, not on a held-out split of this synthetic set alone.

## Schema
See `<doc_id>.labels.json` for entity/clause spans in
`{start, end, label, text}` format, matching NyayaLens schema_version 1.0.
