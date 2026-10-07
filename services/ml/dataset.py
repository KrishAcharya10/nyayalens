"""
Loads ground truth from research/data/synthetic/*.labels.json and the
manifest, in one shared place so fine-tuning, evaluation, and the
no-leakage test all agree on what a "document" and its "entities" are.
"""

import json
import os
import pathlib
from dataclasses import dataclass

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
# NYAYALENS_SYNTHETIC_DIR selects another dataset with the same layout,
# e.g. research/data/synthetic_v2 (see research/generator/generate_batch_v2.py).
SYNTHETIC_DIR = pathlib.Path(
    os.environ.get("NYAYALENS_SYNTHETIC_DIR", REPO_ROOT / "research" / "data" / "synthetic")
)

# Documents uploaded through the real /documents API always get
# is_synthetic=false (correctly - the API has no way to know a file
# originated from the synthetic generator, and a real upload endpoint
# should never let a caller claim synthetic status). apps/api/scripts/
# bulk-upload-synthetic.mjs uploads the 300 synthetic PDFs as this
# dedicated account instead, so Phase 4B scripts select by owner rather
# than by is_synthetic.
EVAL_ACCOUNT_EMAIL = "phase4b-eval@nyayalens.local"


@dataclass
class GroundTruthEntity:
    start: int
    end: int
    label: str
    text: str


@dataclass
class GroundTruthDocument:
    doc_id: str
    document_type: str
    text: str
    entities: list[GroundTruthEntity]


def load_synthetic_documents() -> list[GroundTruthDocument]:
    manifest_path = SYNTHETIC_DIR / "manifest.jsonl"
    entries = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").strip().splitlines()]

    documents = []
    for entry in entries:
        labels_path = SYNTHETIC_DIR / entry["files"]["labels"]
        labels = json.loads(labels_path.read_text(encoding="utf-8"))
        documents.append(
            GroundTruthDocument(
                doc_id=labels["doc_id"],
                document_type=labels["document_type"],
                text=labels["text"],
                entities=[
                    GroundTruthEntity(start=e["start"], end=e["end"], label=e["label"], text=e["text"])
                    for e in labels["entities"]
                ],
            )
        )
    return documents


def entity_label_vocabulary(documents: list[GroundTruthDocument]) -> list[str]:
    """Every distinct entity label actually present in the ground truth,
    sorted for a stable, reproducible label->id mapping across runs."""
    labels = {e.label for doc in documents for e in doc.entities}
    return sorted(labels)


def load_eval_documents_by_doc_id(conn) -> dict[str, dict]:
    """Maps doc_id (the manifest's identifier, stored as `documents.title`
    by bulk-upload-synthetic.mjs) -> {"id": <db uuid>, "canonical_text": str}
    for every document uploaded under the Phase 4B evaluation account."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.id, d.title AS doc_id, d.canonical_text FROM documents d
            JOIN users u ON u.id = d.owner_id
            WHERE u.email = %s
              AND d.canonical_text IS NOT NULL
              AND d.canonical_text != ''
            """,
            (EVAL_ACCOUNT_EMAIL,),
        )
        rows = cur.fetchall()
    return {row["doc_id"]: {"id": row["id"], "canonical_text": row["canonical_text"]} for row in rows}
