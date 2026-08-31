"""
Document-level StratifiedGroupKFold, per docs/architecture/evaluation_design.md's
standing rule: cross-validation operates at the source-document level,
group=document_id, stratify=document_type. Never split a document's
derived samples (entities, clauses) across folds.

Here, group=document_id is trivially one-to-one with the sample (each
document is one row for splitting purposes - predictions and ground
truth entities for that document travel together, since evaluation
compares entities within a held-out document's set, not individual
entities as independent rows). StratifiedGroupKFold is still the right
tool, not overkill: it guarantees the group-uniqueness property
explicitly and by name, rather than relying on "well, we happen to split
one-row-per-document so it's fine" going unstated. See
tests/test_kfold_no_leakage.py for the explicit proof this holds.
"""

import numpy as np
from dataset import GroundTruthDocument
from sklearn.model_selection import StratifiedGroupKFold

N_SPLITS = 5
RANDOM_STATE = 42


def make_folds(
    documents: list[GroundTruthDocument], n_splits: int = N_SPLITS, random_state: int = RANDOM_STATE
) -> list[dict]:
    doc_ids = np.array([d.doc_id for d in documents])
    stratify_labels = np.array([d.document_type for d in documents])
    groups = doc_ids  # group = document_id, per the standing rule

    skf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    folds = []
    for fold_index, (train_idx, test_idx) in enumerate(
        skf.split(np.zeros(len(documents)), stratify_labels, groups)
    ):
        folds.append(
            {
                "fold_index": fold_index,
                "train_doc_ids": set(doc_ids[train_idx].tolist()),
                "test_doc_ids": set(doc_ids[test_idx].tolist()),
            }
        )
    return folds
