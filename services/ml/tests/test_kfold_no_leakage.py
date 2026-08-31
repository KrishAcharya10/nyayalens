"""
Explicit proof that the document-level k-fold split never leaks a
document's samples across the train/test boundary - the mandatory
correctness requirement from docs/architecture/evaluation_design.md.
Run: services/ml/.venv/Scripts/python.exe -m pytest services/ml/tests
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dataset import load_synthetic_documents  # noqa: E402
from kfold import N_SPLITS, make_folds  # noqa: E402


def test_five_folds_produced():
    documents = load_synthetic_documents()
    folds = make_folds(documents)
    assert len(folds) == N_SPLITS


def test_no_document_appears_in_both_train_and_test_of_any_fold():
    documents = load_synthetic_documents()
    folds = make_folds(documents)
    for fold in folds:
        overlap = fold["train_doc_ids"] & fold["test_doc_ids"]
        assert overlap == set(), f"Fold {fold['fold_index']} leaks documents: {overlap}"


def test_every_document_is_tested_exactly_once_across_all_folds():
    documents = load_synthetic_documents()
    folds = make_folds(documents)
    all_doc_ids = {d.doc_id for d in documents}

    test_membership_count: dict[str, int] = {}
    for fold in folds:
        for doc_id in fold["test_doc_ids"]:
            test_membership_count[doc_id] = test_membership_count.get(doc_id, 0) + 1

    assert set(test_membership_count.keys()) == all_doc_ids
    assert all(count == 1 for count in test_membership_count.values())


def test_train_plus_test_covers_every_document_in_every_fold():
    documents = load_synthetic_documents()
    folds = make_folds(documents)
    all_doc_ids = {d.doc_id for d in documents}
    for fold in folds:
        assert fold["train_doc_ids"] | fold["test_doc_ids"] == all_doc_ids


def test_folds_are_roughly_balanced_by_document_type():
    documents = load_synthetic_documents()
    folds = make_folds(documents)
    doc_type_by_id = {d.doc_id: d.document_type for d in documents}

    for fold in folds:
        test_types = [doc_type_by_id[doc_id] for doc_id in fold["test_doc_ids"]]
        residential = test_types.count("residential_rental")
        land_lease = test_types.count("land_lease")
        # 150/150 total over 5 folds -> ~30/30 per fold; allow slack since
        # StratifiedGroupKFold balances by group, not by raw sample count.
        assert abs(residential - land_lease) <= 10, (
            f"Fold {fold['fold_index']} is unbalanced: "
            f"{residential} residential_rental vs {land_lease} land_lease"
        )
