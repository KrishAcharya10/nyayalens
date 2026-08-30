# Synthetic dataset generator (source)

Python source that produced `research/data/synthetic/`. Not part of the
application - kept here for reproducibility and so `dataset_card.md`'s
generator path reference resolves to a real file in this repository.

- `generate_batch.py` — CLI entrypoint (`python generate_batch.py --rental 150 --land_lease 150 --out <dir>`); writes `<doc_id>.{txt,docx,pdf,labels.json}` per document plus `manifest.jsonl` and `dataset_card.md`.
- `generator.py` — builds `residential_rental` / `land_lease` documents from templates with exact character-offset entity/clause tracking, and `verify_offsets()` to confirm every span matches the generated text before it's written.
- `render.py` — renders the generated plain text to `.docx` (python-docx) and `.pdf` (reportlab).
- `value_pools.py` — realistic-looking value pools (names, cities, rent ranges, etc.) via Faker, used to fill document templates.

Requires `python-docx`, `reportlab`, and `faker` to run — not installed
as part of this repo's own dependencies, since regenerating the dataset
is a one-off research task, not something the application needs at
runtime.
