"""
Batch generator for NyayaLens synthetic dataset.

Usage:
    python3 generate_batch.py --rental 150 --land_lease 150 --out /path/to/output

Produces, per document:
    <doc_id>.txt
    <doc_id>.docx
    <doc_id>.pdf
    <doc_id>.labels.json

Plus a top-level manifest.jsonl summarizing the whole batch, and a
dataset_card.md documenting provenance (per spec Section 27).
"""
import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from generator import build_land_lease, build_residential_rental, to_bio_labels, verify_offsets
from render import render_docx, render_pdf


def generate_one(builder_fn, doc_type: str, out_dir: Path) -> dict:
    doc_id = f"{doc_type}_{uuid.uuid4().hex[:10]}"
    doc = builder_fn(doc_id)

    if not verify_offsets(doc):
        raise RuntimeError(f"Offset verification failed for {doc_id} -- aborting batch, fix generator.py")

    txt_path = out_dir / f"{doc_id}.txt"
    docx_path = out_dir / f"{doc_id}.docx"
    pdf_path = out_dir / f"{doc_id}.pdf"
    labels_path = out_dir / f"{doc_id}.labels.json"

    txt_path.write_text(doc.text, encoding="utf-8")
    render_docx(doc.text, str(docx_path))
    render_pdf(doc.text, str(pdf_path))

    labels = to_bio_labels(doc)
    labels_path.write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "doc_id": doc_id,
        "document_type": doc_type,
        "n_entities": len(doc.entities),
        "n_clauses": len(doc.clauses),
        "files": {
            "text": txt_path.name,
            "docx": docx_path.name,
            "pdf": pdf_path.name,
            "labels": labels_path.name,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rental", type=int, default=150, help="Number of residential rental docs to generate")
    parser.add_argument("--land_lease", type=int, default=150, help="Number of land lease docs to generate")
    parser.add_argument("--out", type=str, default="./output", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries = []

    print(f"Generating {args.rental} residential rental documents...")
    for i in range(args.rental):
        entry = generate_one(build_residential_rental, "residential_rental", out_dir)
        manifest_entries.append(entry)
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{args.rental} done")

    print(f"Generating {args.land_lease} land lease documents...")
    for i in range(args.land_lease):
        entry = generate_one(build_land_lease, "land_lease", out_dir)
        manifest_entries.append(entry)
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{args.land_lease} done")

    manifest_path = out_dir / "manifest.jsonl"
    with open(manifest_path, "w", encoding="utf-8") as f:
        for entry in manifest_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    total_entities = sum(e["n_entities"] for e in manifest_entries)
    total_clauses = sum(e["n_clauses"] for e in manifest_entries)

    dataset_card = f"""# NyayaLens Synthetic Dataset Card

## Provenance
- **Source**: Fully synthetic, template-generated (NOT scraped or derived from real documents)
- **Generator**: nyayalens/research/data/synthetic/generate_batch.py
- **Generated on**: {datetime.now(timezone.utc).isoformat()}
- **License**: No license restrictions (originally generated for this project)

## Composition
- Residential rental agreements: {args.rental}
- Land lease deeds: {args.land_lease}
- Total documents: {args.rental + args.land_lease}
- Total labeled entities: {total_entities}
- Total labeled clauses: {total_clauses}

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
`{{start, end, label, text}}` format, matching NyayaLens schema_version 1.0.
"""
    (out_dir / "dataset_card.md").write_text(dataset_card, encoding="utf-8")

    print(f"\nDone. {len(manifest_entries)} documents written to {out_dir}")
    print(f"  Total entities: {total_entities}")
    print(f"  Total clauses:  {total_clauses}")
    print(f"  Manifest: {manifest_path}")
    print(f"  Dataset card: {out_dir / 'dataset_card.md'}")


if __name__ == "__main__":
    main()
