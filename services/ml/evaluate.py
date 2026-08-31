"""
Phase 4B evaluation: StratifiedGroupKFold(k=5, group=document_id,
stratify=document_type) comparing rule_based vs generic_transformer vs
fine_tuned, reporting mean +/- std precision/recall/F1 per entity label
per model_source, per data_source. See docs/architecture/evaluation_design.md
for the standing methodology rules this implements, and
docs/architecture/evaluation_results.md for the actual numbers from the
last real run (not projected/expected ones - see that file's own caveat
about not treating it as evidence of real-world generalization).

Usage:
    services/ml/.venv/Scripts/python.exe services/ml/evaluate.py --data-source synthetic
    services/ml/.venv/Scripts/python.exe services/ml/evaluate.py --data-source real

--data-source real FAILS LOUDLY (raises, does not silently fall back to
synthetic or produce empty results) when research/data/real/*/annotated/
has no data - which is the case as of this phase. See run_real_evaluation().
"""

import argparse
import json
import pathlib
import random
import sys
import time
import uuid
from datetime import datetime, timezone

import numpy as np
from dataset import load_eval_documents_by_doc_id, load_synthetic_documents
from db import get_connection
from finetune_ner import build_label_mappings, predict_entities, train_fold
from kfold import N_SPLITS, make_folds
from metrics import compute_prf

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / "research" / "eval_results"
MODEL_SOURCES = ["rule_based", "generic_transformer", "fine_tuned"]


def get_db_entities(conn, document_id: str, model_source: str) -> list[tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT label, text FROM entities WHERE document_id = %s AND model_source = %s",
            (document_id, model_source),
        )
        return [(row["label"], row["text"]) for row in cur.fetchall()]


def persist_fine_tuned_entities(conn, document_id: str, entities: list[dict]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM entities WHERE document_id = %s AND model_source = 'fine_tuned'",
            (document_id,),
        )
        for e in entities:
            cur.execute(
                """
                INSERT INTO entities
                    (id, document_id, label, text, text_start, text_end, model_name, model_source, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'fine_tuned', now())
                """,
                (
                    str(uuid.uuid4()),
                    document_id,
                    e["label"],
                    e["text"],
                    e["start"],
                    e["end"],
                    "law-ai/InLegalBERT (fold-specific fine-tune)",
                ),
            )
    conn.commit()


def aggregate_across_folds(per_fold_metrics: dict) -> dict:
    result = {}
    for model_source, by_label in per_fold_metrics.items():
        result[model_source] = {}
        for label, fold_metrics_list in by_label.items():
            precisions = [m["precision"] for m in fold_metrics_list]
            recalls = [m["recall"] for m in fold_metrics_list]
            f1s = [m["f1"] for m in fold_metrics_list]
            supports = [m["support"] for m in fold_metrics_list]
            result[model_source][label] = {
                "precision_mean": float(np.mean(precisions)),
                "precision_std": float(np.std(precisions)),
                "recall_mean": float(np.mean(recalls)),
                "recall_std": float(np.std(recalls)),
                "f1_mean": float(np.mean(f1s)),
                "f1_std": float(np.std(f1s)),
                "folds_with_ground_truth_support": sum(1 for s in supports if s > 0),
                "total_folds": len(fold_metrics_list),
                "total_support_across_folds": sum(supports),
            }
    return result


# A single fold's fine-tuning on the full ~240-document training split
# was observed to take multiple hours of wall-clock time on this
# sandbox's CPU (no GPU) - impractical to repeat 5 times in one session.
# Each fold's TRAINING set (never its test set - the full held-out set is
# still evaluated) is subsampled to this many documents, with a fixed
# seed for reproducibility. This is a further, honestly-documented
# compute-constrained trade-off - see evaluation_results.md for what it
# implies about the reported metrics' ceiling, and note it does NOT
# compromise the k-fold methodology itself: grouping, stratification, and
# the no-leakage guarantee (tests/test_kfold_no_leakage.py) are unaffected,
# since subsampling happens only within an already-correct train split.
TRAIN_SUBSAMPLE_SIZE = 60
SUBSAMPLE_SEED = 42


def run_synthetic_evaluation() -> tuple[dict, list[dict]]:
    documents = load_synthetic_documents()
    conn = get_connection()
    db_docs = load_eval_documents_by_doc_id(conn)

    missing = [d.doc_id for d in documents if d.doc_id not in db_docs]
    if missing:
        raise RuntimeError(
            f"{len(missing)} synthetic documents have not been uploaded/processed yet - "
            f"run apps/api/scripts/bulk-upload-synthetic.mjs first. Missing e.g.: {missing[:5]}"
        )

    label_list, label2id, id2label = build_label_mappings(documents)
    folds = make_folds(documents, n_splits=N_SPLITS)
    rng = random.Random(SUBSAMPLE_SEED)

    per_fold_metrics: dict[str, dict[str, list[dict]]] = {ms: {} for ms in MODEL_SOURCES}

    for fold in folds:
        fold_index = fold["fold_index"]
        full_train_docs = [d for d in documents if d.doc_id in fold["train_doc_ids"]]
        train_docs = (
            rng.sample(full_train_docs, TRAIN_SUBSAMPLE_SIZE)
            if len(full_train_docs) > TRAIN_SUBSAMPLE_SIZE
            else full_train_docs
        )
        test_docs = [d for d in documents if d.doc_id in fold["test_doc_ids"]]
        print(
            f"[evaluate] Fold {fold_index + 1}/{N_SPLITS}: {len(train_docs)} train "
            f"(subsampled from {len(full_train_docs)}), {len(test_docs)} test"
        )

        started = time.time()
        tokenizer, model = train_fold(
            train_docs, label_list, label2id, id2label, log=lambda m: print(f"[evaluate]  {m}")
        )
        fold_train_seconds = time.time() - started
        print(f"[evaluate]  fine-tuning took {fold_train_seconds:.1f}s")

        predicted_by_source: dict[str, list[tuple[str, str]]] = {ms: [] for ms in MODEL_SOURCES}
        ground_truth: list[tuple[str, str]] = []

        for doc in test_docs:
            db_id = db_docs[doc.doc_id]["id"]
            db_text = db_docs[doc.doc_id]["canonical_text"]

            ground_truth.extend((e.label, e.text) for e in doc.entities)
            predicted_by_source["rule_based"].extend(get_db_entities(conn, db_id, "rule_based"))
            predicted_by_source["generic_transformer"].extend(
                get_db_entities(conn, db_id, "generic_transformer")
            )

            # Fine-tuned model runs on the SAME PDF-extracted canonical_text
            # the other two model sources were scored against (not the
            # ground-truth .txt), so the comparison is apples-to-apples -
            # all three model sources face the same input text per document.
            ft_entities = predict_entities(tokenizer, model, id2label, db_text)
            persist_fine_tuned_entities(conn, db_id, ft_entities)
            predicted_by_source["fine_tuned"].extend((e["label"], e["text"]) for e in ft_entities)

        for model_source in MODEL_SOURCES:
            metrics_by_label = compute_prf(predicted_by_source[model_source], ground_truth)
            for label, m in metrics_by_label.items():
                per_fold_metrics[model_source].setdefault(label, []).append(m)

        # Checkpoint after every fold: a multi-hour run should never lose
        # completed folds' results if interrupted before the last one.
        write_report(aggregate_across_folds(per_fold_metrics), folds[: fold_index + 1], checkpoint=True)
        print(f"[evaluate]  checkpointed after fold {fold_index + 1}/{N_SPLITS}")

    conn.close()
    return aggregate_across_folds(per_fold_metrics), folds


def run_real_evaluation() -> None:
    real_dir = REPO_ROOT / "research" / "data" / "real"
    annotated_dirs = [real_dir / "residential_rental" / "annotated", real_dir / "land_lease" / "annotated"]
    has_any_annotated_file = any(
        d.exists() and any(p.is_file() for p in d.iterdir()) for d in annotated_dirs
    )
    if not has_any_annotated_file:
        raise RuntimeError(
            "--data-source real requested, but research/data/real/{residential_rental,land_lease}/annotated/ "
            "is empty. Real-document evaluation has NOT been performed and this script refuses to silently "
            "fall back to synthetic data or produce empty/fabricated results. Collect and annotate real "
            "documents first (see research/data/real/*/README.md)."
        )
    # Not reached until real annotated data exists - see docs/architecture/evaluation_results.md.
    raise NotImplementedError(
        "Real annotated data was found, but the real-data evaluation path is not yet implemented "
        "(only synthetic was built and run in this phase)."
    )


def render_markdown(payload: dict) -> str:
    partial_note = (
        f" - PARTIAL: {payload['n_folds_completed']}/{N_SPLITS} folds (checkpoint, run still in progress)"
        if payload.get("n_folds_completed", N_SPLITS) < N_SPLITS
        else ""
    )
    lines = [
        f"# Phase 4B evaluation results{partial_note}",
        "",
        f"- **Data source**: {payload['data_source']}",
        f"- **Generated at**: {payload['generated_at']} (UTC)",
        f"- **Folds**: {payload.get('n_folds_completed', N_SPLITS)}/{N_SPLITS} completed "
        "(StratifiedGroupKFold, group=document_id, stratify=document_type)",
        f"- **Documents evaluated**: {payload['n_documents']}",
        "",
        "Metrics are content-match (label + exact text), mean +/- std across folds - "
        "see services/ml/metrics.py for why, not offset-match. "
        "**Synthetic-only. Not evidence of real-world performance** - see "
        "docs/architecture/evaluation_design.md.",
        "",
    ]

    for model_source, by_label in payload["results"].items():
        lines.append(f"## model_source = {model_source}")
        lines.append("")
        lines.append("| Label | Precision | Recall | F1 | Support (total) | Folds with support |")
        lines.append("|---|---|---|---|---|---|")
        for label in sorted(by_label.keys()):
            m = by_label[label]
            lines.append(
                f"| {label} | {m['precision_mean']:.3f} +/- {m['precision_std']:.3f} "
                f"| {m['recall_mean']:.3f} +/- {m['recall_std']:.3f} "
                f"| {m['f1_mean']:.3f} +/- {m['f1_std']:.3f} "
                f"| {m['total_support_across_folds']} "
                f"| {m['folds_with_ground_truth_support']}/{m['total_folds']} |"
            )
        lines.append("")

    return "\n".join(lines)


_RUN_TIMESTAMP: str | None = None


def _run_timestamp() -> str:
    global _RUN_TIMESTAMP
    if _RUN_TIMESTAMP is None:
        _RUN_TIMESTAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return _RUN_TIMESTAMP


def write_report(results: dict, folds_so_far: list[dict], checkpoint: bool = False) -> None:
    """Writes (or overwrites) this run's JSON+MD report under one
    timestamped filename - checkpoint=True calls (after each fold) and
    the final call all target the same path, so an interrupted run still
    leaves the most recently completed folds' results on disk instead of
    only ever writing a report after every fold finishes."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "data_source": "synthetic",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "n_folds_completed": len(folds_so_far),
        "n_documents": sum(len(f["test_doc_ids"]) for f in folds_so_far),
        "results": results,
    }

    timestamp = _run_timestamp()
    json_path = RESULTS_DIR / f"synthetic_{timestamp}.json"
    md_path = RESULTS_DIR / f"synthetic_{timestamp}.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown(payload), encoding="utf-8")

    if not checkpoint:
        print(f"[evaluate] Wrote {json_path}")
        print(f"[evaluate] Wrote {md_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 4B evaluation")
    parser.add_argument("--data-source", choices=["synthetic", "real"], required=True)
    args = parser.parse_args()

    print(f"[evaluate] data_source={args.data_source}")
    print(f"[evaluate] model_sources being compared: {', '.join(MODEL_SOURCES)}")

    if args.data_source == "real":
        run_real_evaluation()
        return

    results, folds = run_synthetic_evaluation()
    write_report(results, folds, checkpoint=False)


if __name__ == "__main__":
    sys.exit(main())
