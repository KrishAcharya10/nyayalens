"""
Recomputes Phase 4B metrics from already-persisted DB data, without
re-running any fine-tuning. Exists because two real bugs were found and
fixed DURING the 5-fold evaluate.py run in
apps/api/src/ner/rulePatterns.ts (LESSEE pattern) and services/ml/metrics.py
(currency-symbol normalization) - Python does not hot-reload a running
process, so evaluate.py's checkpoints reflect the OLD (buggy) rule_based
data and OLD (unnormalized) matching. Fixing this needs neither: the
LESSEE fix was already backfilled into Postgres (apps/api/scripts/
backfill-rule-based-ner.mjs, run separately, before this script), and the
normalization fix lives in metrics.py, imported fresh here. fine_tuned
entities are untouched by either bug and are reused as-is.

Reproduces the exact same fold membership as the completed evaluate.py
run via the same make_folds(n_splits=5, random_state=42) call - the
StratifiedGroupKFold split is a deterministic function of its inputs, so
this is not a new/different split, just the same one recomputed.

Usage:
    services/ml/.venv/Scripts/python.exe services/ml/rescore.py
"""

import json
import sys
from datetime import datetime, timezone

from dataset import load_eval_documents_by_doc_id, load_synthetic_documents
from db import get_connection
from evaluate import MODEL_SOURCES, RESULTS_DIR, aggregate_across_folds, get_db_entities, render_markdown
from kfold import N_SPLITS, make_folds
from metrics import compute_prf


def main() -> None:
    documents = load_synthetic_documents()
    conn = get_connection()
    db_docs = load_eval_documents_by_doc_id(conn)

    folds = make_folds(documents, n_splits=N_SPLITS)
    per_fold_metrics: dict[str, dict[str, list[dict]]] = {ms: {} for ms in MODEL_SOURCES}

    for fold in folds:
        fold_index = fold["fold_index"]
        test_docs = [d for d in documents if d.doc_id in fold["test_doc_ids"]]
        print(f"[rescore] Fold {fold_index + 1}/{N_SPLITS}: {len(test_docs)} test documents")

        predicted_by_source: dict[str, list[tuple[str, str]]] = {ms: [] for ms in MODEL_SOURCES}
        ground_truth: list[tuple[str, str]] = []

        for doc in test_docs:
            db_id = db_docs[doc.doc_id]["id"]
            ground_truth.extend((e.label, e.text) for e in doc.entities)
            for model_source in MODEL_SOURCES:
                predicted_by_source[model_source].extend(get_db_entities(conn, db_id, model_source))

        for model_source in MODEL_SOURCES:
            metrics_by_label = compute_prf(predicted_by_source[model_source], ground_truth)
            for label, m in metrics_by_label.items():
                per_fold_metrics[model_source].setdefault(label, []).append(m)

    conn.close()
    results = aggregate_across_folds(per_fold_metrics)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "data_source": "synthetic",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "n_folds_completed": len(folds),
        "n_documents": sum(len(f["test_doc_ids"]) for f in folds),
        "results": results,
        "note": (
            "Rescored from already-persisted DB predictions after fixing two bugs found during "
            "the original evaluation run: apps/api/src/ner/rulePatterns.ts's LESSEE pattern, and "
            "services/ml/metrics.py's missing currency-symbol normalization. No re-training was "
            "performed - fine_tuned entities are the same ones the original run persisted."
        ),
    }

    json_path = RESULTS_DIR / f"synthetic_{timestamp}_rescored.json"
    md_path = RESULTS_DIR / f"synthetic_{timestamp}_rescored.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown(payload), encoding="utf-8")

    print(f"[rescore] Wrote {json_path}")
    print(f"[rescore] Wrote {md_path}")


if __name__ == "__main__":
    sys.exit(main())
