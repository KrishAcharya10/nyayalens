"""
Phase 4B addendum: label-agnostic span-overlap scoring for
generic_transformer, computed ALONGSIDE (not replacing) the existing
label-exact metric in evaluation_results.md. See metrics.py's
compute_span_overlap_prf docstring for why this exists.

Uses ONLY already-persisted DB data (generic_transformer entities'
text_start/text_end, already computed against canonical_text - confirmed
present before writing this script) and the ground truth from
dataset.py. No re-inference, no re-training, no changes to rule_based or
fine_tuned scoring. Reuses the identical fold split evaluate.py and
rescore.py already used (same make_folds(n_splits=5, random_state=42)
call), so this is directly comparable to the existing report.

Usage:
    services/ml/.venv/Scripts/python.exe services/ml/score_generic_transformer_overlap.py
"""

import json
import sys
from datetime import datetime, timezone

import numpy as np
from dataset import load_eval_documents_by_doc_id, load_synthetic_documents
from db import get_connection
from evaluate import RESULTS_DIR
from kfold import N_SPLITS, make_folds
from metrics import IOU_THRESHOLD, compute_span_overlap_prf
from span_alignment import map_gold_spans_to_text


def get_generic_transformer_spans(conn, document_id: str) -> list[tuple[int, int]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT text_start, text_end FROM entities "
            "WHERE document_id = %s AND model_source = 'generic_transformer' "
            "AND text_start IS NOT NULL AND text_end IS NOT NULL",
            (document_id,),
        )
        return [(row["text_start"], row["text_end"]) for row in cur.fetchall()]


def main() -> None:
    documents = load_synthetic_documents()
    conn = get_connection()
    db_docs = load_eval_documents_by_doc_id(conn)

    missing = [d.doc_id for d in documents if d.doc_id not in db_docs]
    if missing:
        raise RuntimeError(f"{len(missing)} documents not uploaded/processed - run bulk-upload-synthetic.mjs")

    folds = make_folds(documents, n_splits=N_SPLITS)
    fold_metrics: list[dict] = []
    unmapped_gold_total = 0
    gold_total = 0

    for fold in folds:
        fold_index = fold["fold_index"]
        test_docs = [d for d in documents if d.doc_id in fold["test_doc_ids"]]

        pooled_predicted: list[tuple[int, int]] = []
        pooled_gold: list[tuple[int, int]] = []

        for doc in test_docs:
            db_id = db_docs[doc.doc_id]["id"]
            canonical_text = db_docs[doc.doc_id]["canonical_text"]

            predicted_spans = get_generic_transformer_spans(conn, db_id)
            gold_spans = map_gold_spans_to_text(doc.entities, canonical_text)

            gold_total += len(doc.entities)
            unmapped_gold_total += len(doc.entities) - len(gold_spans)

            pooled_predicted.extend(predicted_spans)
            pooled_gold.extend(gold_spans)

        metrics = compute_span_overlap_prf(pooled_predicted, pooled_gold)
        print(
            f"[span-overlap] Fold {fold_index + 1}/{N_SPLITS}: "
            f"precision={metrics['precision']:.3f} recall={metrics['recall']:.3f} "
            f"f1={metrics['f1']:.3f} (gold={metrics['support']}, predicted={metrics['predicted_count']})"
        )
        fold_metrics.append(metrics)

    conn.close()

    precisions = [m["precision"] for m in fold_metrics]
    recalls = [m["recall"] for m in fold_metrics]
    f1s = [m["f1"] for m in fold_metrics]

    aggregate = {
        "iou_threshold": IOU_THRESHOLD,
        "precision_mean": float(np.mean(precisions)),
        "precision_std": float(np.std(precisions)),
        "recall_mean": float(np.mean(recalls)),
        "recall_std": float(np.std(recalls)),
        "f1_mean": float(np.mean(f1s)),
        "f1_std": float(np.std(f1s)),
        "n_folds": len(fold_metrics),
        "gold_entities_total": gold_total,
        "gold_entities_not_locatable_in_canonical_text": unmapped_gold_total,
    }

    print("\n[span-overlap] Aggregate across folds (mean +/- std):")
    print(
        f"  precision={aggregate['precision_mean']:.3f}+/-{aggregate['precision_std']:.3f} "
        f"recall={aggregate['recall_mean']:.3f}+/-{aggregate['recall_std']:.3f} "
        f"f1={aggregate['f1_mean']:.3f}+/-{aggregate['f1_std']:.3f}"
    )
    print(
        f"[span-overlap] {unmapped_gold_total}/{gold_total} gold entities could not be located "
        "in canonical_text (excluded from scoring, not fabricated a position)"
    )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = RESULTS_DIR / f"generic_transformer_span_overlap_{timestamp}.json"
    out_path.write_text(json.dumps(aggregate, indent=2), encoding="utf-8")
    print(f"[span-overlap] Wrote {out_path}")


if __name__ == "__main__":
    sys.exit(main())
