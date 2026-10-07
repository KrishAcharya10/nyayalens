# Synthetic dataset generator (source)

Python source that produced `research/data/synthetic/`. Not part of the
application - kept here for reproducibility and so `dataset_card.md`'s
generator path reference resolves to a real file in this repository.

- `generate_batch.py` — CLI entrypoint (`python generate_batch.py --rental 150 --land_lease 150 --out <dir>`); writes `<doc_id>.{txt,docx,pdf,labels.json}` per document plus `manifest.jsonl` and `dataset_card.md`.
- `generator.py` — builds `residential_rental` / `land_lease` documents from templates with exact character-offset entity/clause tracking, and `verify_offsets()` to confirm every span matches the generated text before it's written.
- `render.py` — renders the generated plain text to `.docx` (python-docx) and `.pdf` (reportlab).
- `value_pools.py` — realistic-looking value pools (names, cities, rent ranges, etc.) via Faker, used to fill document templates.

Requires `python-docx`, `reportlab`, and `faker` to run (see `requirements.txt`) — not installed
as part of this repo's own dependencies, since regenerating the dataset
is a one-off research task, not something the application needs at
runtime.

## v2 generator (`*_v2.py`)

A second, larger and more realistic dataset, written to
`research/data/synthetic_v2/` (git-ignored - regenerate it; v1's
`research/data/synthetic/` is never touched, so every published v1 metric
stays reproducible).

```powershell
python -m venv research/generator/.venv
research/generator/.venv/Scripts/pip install -r research/generator/requirements.txt
research/generator/.venv/Scripts/python.exe research/generator/generate_batch_v2.py   # 1200 docs, seed 2026, ~15 min
research/generator/.venv/Scripts/python.exe -m pytest research/generator/tests -q
```

- `generator_v2.py` - document builders, held-out-template logic, and
  `validate()` (offsets, overlaps, domain vocabulary, geography) which
  every document must pass before it is written.
- `value_pools_v2.py` - state-consistent geography and land-record terms,
  names/companies, lakh-grouped currency, amounts in words, dates.
- `render_v2.py` - PDF with a rupee-capable embedded font (v1's Helvetica
  had no rupee glyph - the root cause of the mangled `₹` in v1 PDFs), DOCX,
  and simulated scans (image-only PDFs) for the OCR path.
- `generate_batch_v2.py` - CLI; writes v1-compatible files + manifest plus
  splits, and a dataset card with real counts.

What changed vs v1 and why is in `generator_v2.py`'s module docstring and
in the generated `dataset_card.md`. To run the existing ML/eval tooling on
v2, set `NYAYALENS_SYNTHETIC_DIR=research/data/synthetic_v2` (read by
`services/ml/dataset.py` and `apps/api/scripts/bulk-upload-synthetic.mjs`).
