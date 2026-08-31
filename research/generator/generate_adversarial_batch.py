"""
Batch generator for NyayaLens's Phase 6 adversarial + matched-control
test set (research/data/adversarial/). Same discipline as
generate_batch.py: verify_offsets() before every document is accepted,
writes .txt/.docx/.pdf/.labels.json per document plus a manifest -
adversarial_manifest.jsonl here, with expected_flag alongside the usual
entity/clause spans.

Usage:
    python generate_adversarial_batch.py --per-category 15 --out /path/to/output
"""

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from adversarial_generator import (
    AdversarialDocument,
    build_asymmetric_obligation,
    build_land_use_contradiction,
    build_liability_shift,
    build_missing_clause,
    build_unbounded_discretion,
    verify,
)

from generator import to_bio_labels
from render import render_docx, render_pdf

RESIDENTIAL_OMITTABLE = ["DISPUTE_RESOLUTION", "TERMINATION", "JURISDICTION", "SECURITY_DEPOSIT"]
LAND_LEASE_OMITTABLE = ["DISPUTE_RESOLUTION", "TERMINATION", "JURISDICTION", "LEASE_PREMIUM"]


def _doc_id(category_slug: str, is_control: bool) -> str:
    prefix = "control" if is_control else "adversarial"
    return f"{prefix}_{category_slug}_{uuid.uuid4().hex[:10]}"


def _write_one(adv: AdversarialDocument, out_dir: Path, category_slug: str) -> dict:
    if not verify(adv):
        raise RuntimeError(f"Offset verification failed for {adv.doc.doc_id} - aborting batch")

    doc_id = adv.doc.doc_id
    txt_path = out_dir / f"{doc_id}.txt"
    docx_path = out_dir / f"{doc_id}.docx"
    pdf_path = out_dir / f"{doc_id}.pdf"
    labels_path = out_dir / f"{doc_id}.labels.json"

    txt_path.write_text(adv.doc.text, encoding="utf-8")
    render_docx(adv.doc.text, str(docx_path))
    render_pdf(adv.doc.text, str(pdf_path))

    labels = to_bio_labels(adv.doc)
    labels["expected_flag"] = {
        "category": adv.expected_flag.category,
        "detail": adv.expected_flag.detail,
        "is_control": adv.is_control,
    }
    labels_path.write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "doc_id": doc_id,
        "document_type": adv.doc.document_type,
        "category": category_slug,
        "is_control": adv.is_control,
        "expected_flag": labels["expected_flag"],
        "n_entities": len(adv.doc.entities),
        "n_clauses": len(adv.doc.clauses),
        "files": {
            "text": txt_path.name,
            "docx": docx_path.name,
            "pdf": pdf_path.name,
            "labels": labels_path.name,
        },
    }


def generate_category(category_slug: str, per_category: int, out_dir: Path) -> list[dict]:
    entries = []
    half = per_category

    if category_slug == "liability_shift":
        for _ in range(half):
            entries.append(_write_one(build_liability_shift(_doc_id(category_slug, False), adversarial=True), out_dir, category_slug))
        for _ in range(half):
            entries.append(_write_one(build_liability_shift(_doc_id(category_slug, True), adversarial=False), out_dir, category_slug))

    elif category_slug == "asymmetric_obligation":
        for i in range(half):
            doc_type = "residential_rental" if i % 2 == 0 else "land_lease"
            entries.append(
                _write_one(
                    build_asymmetric_obligation(_doc_id(category_slug, False), doc_type, adversarial=True),
                    out_dir,
                    category_slug,
                )
            )
        for i in range(half):
            doc_type = "residential_rental" if i % 2 == 0 else "land_lease"
            entries.append(
                _write_one(
                    build_asymmetric_obligation(_doc_id(category_slug, True), doc_type, adversarial=False),
                    out_dir,
                    category_slug,
                )
            )

    elif category_slug == "unbounded_discretion":
        for _ in range(half):
            entries.append(_write_one(build_unbounded_discretion(_doc_id(category_slug, False), adversarial=True), out_dir, category_slug))
        for _ in range(half):
            entries.append(_write_one(build_unbounded_discretion(_doc_id(category_slug, True), adversarial=False), out_dir, category_slug))

    elif category_slug == "land_use_contradiction":
        for _ in range(half):
            entries.append(_write_one(build_land_use_contradiction(_doc_id(category_slug, False), adversarial=True), out_dir, category_slug))
        for _ in range(half):
            entries.append(_write_one(build_land_use_contradiction(_doc_id(category_slug, True), adversarial=False), out_dir, category_slug))

    elif category_slug == "missing_clause":
        for i in range(half):
            doc_type = "residential_rental" if i % 2 == 0 else "land_lease"
            omit_pool = RESIDENTIAL_OMITTABLE if doc_type == "residential_rental" else LAND_LEASE_OMITTABLE
            omit = omit_pool[i % len(omit_pool)]
            entries.append(
                _write_one(
                    build_missing_clause(_doc_id(category_slug, False), doc_type, omit=omit),
                    out_dir,
                    category_slug,
                )
            )
        for i in range(half):
            doc_type = "residential_rental" if i % 2 == 0 else "land_lease"
            entries.append(
                _write_one(
                    build_missing_clause(_doc_id(category_slug, True), doc_type, omit=None),
                    out_dir,
                    category_slug,
                )
            )
    else:
        raise ValueError(f"Unknown category slug: {category_slug}")

    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-category", type=int, default=15, help="Positive cases per category (matched by equally many controls)")
    parser.add_argument("--out", type=str, default="./output", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    categories = [
        "liability_shift",
        "asymmetric_obligation",
        "unbounded_discretion",
        "land_use_contradiction",
        "missing_clause",
    ]

    all_entries = []
    for category_slug in categories:
        print(f"Generating {category_slug}: {args.per_category} adversarial + {args.per_category} control...")
        entries = generate_category(category_slug, args.per_category, out_dir)
        all_entries.extend(entries)
        print(f"  {len(entries)} documents written")

    manifest_path = out_dir / "adversarial_manifest.jsonl"
    with open(manifest_path, "w", encoding="utf-8") as f:
        for entry in all_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    n_adversarial = sum(1 for e in all_entries if not e["is_control"])
    n_control = sum(1 for e in all_entries if e["is_control"])

    dataset_card = f"""# NyayaLens Adversarial Test Set Card

## Provenance
- **Source**: Fully synthetic, template-generated (NOT scraped or derived from real documents)
- **Generator**: nyayalens/research/generator/adversarial_generator.py + generate_adversarial_batch.py
- **Generated on**: {datetime.now(timezone.utc).isoformat()}
- **Design note**: docs/research/adversarial_test_design.md
- **License**: No license restrictions (originally generated for this project)

## Composition
- Total documents: {len(all_entries)}
- Adversarial (positive) cases: {n_adversarial}
- Matched controls (expected_flag=None): {n_control}
- Categories: {", ".join(categories)}

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
"""
    (out_dir / "adversarial_dataset_card.md").write_text(dataset_card, encoding="utf-8")

    print(f"\nDone. {len(all_entries)} documents written to {out_dir}")
    print(f"  Adversarial: {n_adversarial}, Control: {n_control}")
    print(f"  Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
