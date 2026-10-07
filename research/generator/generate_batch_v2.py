"""
Batch CLI for the v2 synthetic dataset (generator_v2.py).

    research/generator/.venv/Scripts/python.exe research/generator/generate_batch_v2.py
        [--rental 600] [--land_lease 600] [--out research/data/synthetic_v2] [--seed 2026]
        [--scanned-frac 0.1] [--canonical-heading-frac 0.45] [--no-docx]

Writes the same per-document files and manifest.jsonl shape as v1's
generate_batch.py (so services/ml/dataset.py and bulk-upload-synthetic.mjs
read it unchanged via NYAYALENS_SYNTHETIC_DIR), plus a `split` and
`render` field per manifest entry and a dataset_card.md with real counts.

Fully deterministic for a given --seed (same documents, ids, and splits).
v1's research/data/synthetic/ is never touched: every published v1 metric
stays reproducible.
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import generator_v2 as g
import render_v2 as r
import value_pools_v2 as vp
from generator import to_bio_labels
from value_pools_v2 import rng

SPLITS = (("train", 0.7), ("dev", 0.1), ("test", 0.2))


def assign_splits(n: int) -> list[str]:
    """Exact 70/10/20 proportions, shuffled deterministically."""
    out = []
    for name, frac in SPLITS:
        out += [name] * round(n * frac)
    out = (out + ["train"] * n)[:n]
    rng.shuffle(out)
    return out


def pick_heading_style(canonical_frac: float) -> str:
    if rng.random() < canonical_frac:
        return g.CANONICAL_HEADING_STYLE
    return rng.choice([s for s in g.HEADING_STYLES if s != g.CANONICAL_HEADING_STYLE])


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--rental", type=int, default=600)
    parser.add_argument("--land_lease", type=int, default=600)
    parser.add_argument("--out", type=Path, default=root / "data" / "synthetic_v2")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--scanned-frac", type=float, default=0.1)
    parser.add_argument("--canonical-heading-frac", type=float, default=0.45)
    parser.add_argument("--no-docx", action="store_true")
    args = parser.parse_args()

    vp.seed_all(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)

    manifest, stats = [], {k: Counter() for k in ("labels", "clauses", "styles", "risks", "splits", "render", "states", "currency")}
    jobs = [("residential_rental", g.build_residential_rental, args.rental),
            ("land_lease", g.build_land_lease, args.land_lease)]
    for doc_type, build, count in jobs:
        splits = assign_splits(count)
        print(f"Generating {count} {doc_type} documents...")
        for i in range(count):
            doc_id = f"v2_{doc_type}_{rng.getrandbits(40):010x}"
            doc, _ = build(doc_id, splits[i], pick_heading_style(args.canonical_heading_frac))
            problems = g.validate(doc)
            if problems:
                sys.exit(f"[ABORT] {doc_id} failed validation: {problems} - fix generator_v2.py")

            scanned = rng.random() < args.scanned_frac
            layout = r.random_layout()
            doc.metadata["render"] = "scanned" if scanned else "native"
            doc.metadata["pdf_font"] = layout.font.family

            files = {"text": f"{doc_id}.txt", "pdf": f"{doc_id}.pdf", "labels": f"{doc_id}.labels.json"}
            (args.out / files["text"]).write_text(doc.text, encoding="utf-8")
            (r.render_scanned_pdf if scanned else r.render_pdf)(doc.text, str(args.out / files["pdf"]), layout)
            if not args.no_docx:
                files["docx"] = f"{doc_id}.docx"
                r.render_docx(doc.text, str(args.out / files["docx"]), layout)
            (args.out / files["labels"]).write_text(
                json.dumps(to_bio_labels(doc), ensure_ascii=False, indent=2), encoding="utf-8")

            md = doc.metadata
            manifest.append({"doc_id": doc_id, "document_type": doc_type, "split": md["split"],
                             "render": md["render"], "heading_style": md["heading_style"],
                             "n_entities": len(doc.entities), "n_clauses": len(doc.clauses),
                             "injected_risks": [x["category"] for x in md["injected_risks"]], "files": files})
            stats["labels"].update(e.label for e in doc.entities)
            stats["clauses"].update(c.label for c in doc.clauses)
            stats["styles"][md["heading_style"]] += 1
            stats["risks"].update(x["category"] for x in md["injected_risks"])
            stats["splits"][f"{doc_type}/{md['split']}"] += 1
            stats["render"][md["render"]] += 1
            stats["states"][md["state"]] += 1
            stats["currency"][md["currency_style"]] += 1
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{count}")

    with open(args.out / "manifest.jsonl", "w", encoding="utf-8") as f:
        for entry in manifest:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    (args.out / "dataset_card.md").write_text(dataset_card(args, manifest, stats), encoding="utf-8")
    print(f"\nDone: {len(manifest)} documents -> {args.out}")
    print(f"  entities: {sum(stats['labels'].values())}, clauses: {sum(stats['clauses'].values())}, "
          f"injected risks: {sum(stats['risks'].values())}")


def _table(counter: Counter, header: str) -> str:
    rows = "\n".join(f"| {k} | {v} |" for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0])))
    return f"| {header} | Count |\n|---|---|\n{rows}"


def dataset_card(args, manifest, stats) -> str:
    n = len(manifest)
    return f"""# NyayaLens Synthetic Dataset Card - v2

## Provenance
- **Source**: Fully synthetic, template-generated (NOT scraped or derived from real documents)
- **Generator**: `research/generator/generate_batch_v2.py` (generator version {g.GENERATOR_VERSION})
- **Command**: `--rental {args.rental} --land_lease {args.land_lease} --seed {args.seed} --scanned-frac {args.scanned_frac} --canonical-heading-frac {args.canonical_heading_frac}`
- **Generated on**: {datetime.now(timezone.utc).isoformat()}
- **Deterministic**: re-running with the same seed reproduces identical documents, ids and splits.

## Composition
- Documents: {n} ({args.rental} residential rental, {args.land_lease} land lease)
- Labeled entities: {sum(stats['labels'].values())}
- Labeled clauses: {sum(stats['clauses'].values())}
- Rendered as native-text PDF: {stats['render']['native']}; as simulated scans (image-only, needs OCR): {stats['render']['scanned']}

## Splits
Assigned per document type (70/10/20). **`dev` is in-distribution; `test` is
partly out-of-distribution**: train/dev documents never use the last ~25% of
any template pool with 3+ variants (phrasings, headings, titles), and test
documents draw from those held-out variants half the time. Each document's
`metadata.heldout_templates` lists which held-out variants it uses, so test
scores can be sliced into seen-template vs unseen-template performance.

{_table(stats['splits'], 'Split')}

## Entity labels
New in v2: EXECUTION_DATE, COMMENCEMENT_DATE, EXPIRY_DATE, PROPERTY_ADDRESS,
ESCALATION_RATE, LOCK_IN_PERIOD, KHATA_NUMBER, EASEMENT_RIGHT, WITNESS. Every
mention of a party is labeled (preamble and signature block). Survey numbers
of neighbouring plots in the property schedule are deliberately **unlabeled**
(they are not the leased land's survey number) - hard negatives.

{_table(stats['labels'], 'Label')}

## Clause types
Clause types not in the app's current taxonomy (`apps/api/src/clauses/clauseTaxonomy.ts`)
will show as misses for the rule-based classifier - that is expected and is the point.

{_table(stats['clauses'], 'Clause type')}

## Heading styles
Only `numbered_caps` matches the app's current clause segmenter.

{_table(stats['styles'], 'Style')}

## Injected risks (ground truth for the risk engine)
Recorded per document in `metadata.injected_risks` (category, clause type,
detail). Phrased independently of the risk engine's regexes. Optional clauses
that were left out are listed in `metadata.omitted_clauses`, from which
MISSING_CLAUSE expectations can be derived.

{_table(stats['risks'], 'Category')}

## Currency formats (labeled span)

{_table(stats['currency'], 'Format')}

## Geography

{_table(stats['states'], 'State')}

## Known limitations (report these honestly)
- Still template-generated: 2-5 phrasings per clause is far more than v1 but
  far less than real drafting. Synthetic results are not evidence of
  real-world performance - `research/data/real/` remains the only valid test.
- English only; no bilingual (Hindi/regional) deeds.
- Simulated scans are clean typeset text with synthetic noise - easier than
  real photocopies, stamps, signatures and handwriting.
- Value distributions are hand-picked plausible ranges, not real statistics.
- The same author wrote the unfair-clause variants and knows the risk
  taxonomy; they were not written against the detector regexes, but this is
  still not an independent adversarial test.
"""


if __name__ == "__main__":
    main()
