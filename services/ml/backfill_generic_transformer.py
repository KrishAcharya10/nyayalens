"""
Bulk-runs the generic-transformer NER baseline (Phase 4A, model_source=
generic_transformer) over every already-uploaded synthetic document,
loading the model ONCE rather than once per document.

Why this exists separately from apps/api's live pipeline: the Node
pipeline (apps/api/src/jobs/pipeline.ts) spawns a fresh Python process
per document upload, which is fine for one live upload at a time but
reloads PyTorch + the model (~10s fixed overhead) every single time -
intolerable for backfilling 300 documents needed for Phase 4B
evaluation. This script loads the model once and reuses it across every
document, going straight to Postgres (bypassing the Node API entirely,
since this is a bulk research/evaluation operation, not a live user
request).

Usage:
    services/ml/.venv/Scripts/python.exe services/ml/backfill_generic_transformer.py
"""

import sys
import time
import uuid

from baseline_ner import load_ner_pipeline, run_ner
from dataset import load_eval_documents_by_doc_id
from db import get_connection


def main() -> None:
    conn = get_connection()
    try:
        documents_by_id = load_eval_documents_by_doc_id(conn)
        documents = list(documents_by_id.values())

        print(f"[backfill] {len(documents)} evaluation-account documents with canonical_text found")
        if not documents:
            print("[backfill] Nothing to do - run bulk-upload-synthetic.mjs first")
            return

        print("[backfill] Loading dslim/distilbert-NER (once)...")
        ner_pipeline = load_ner_pipeline()

        started = time.time()
        total_entities = 0
        for i, doc in enumerate(documents, start=1):
            entities = run_ner(ner_pipeline, doc["canonical_text"])
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM entities WHERE document_id = %s AND model_source = 'generic_transformer'",
                    (doc["id"],),
                )
                for e in entities:
                    cur.execute(
                        """
                        INSERT INTO entities
                            (id, document_id, label, text, text_start, text_end,
                             confidence, model_name, model_source, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'generic_transformer', now())
                        """,
                        (
                            str(uuid.uuid4()),
                            doc["id"],
                            e["label"],
                            e["text"],
                            e["start"],
                            e["end"],
                            e["confidence"],
                            e["modelName"],
                        ),
                    )
            conn.commit()
            total_entities += len(entities)
            if i % 25 == 0 or i == len(documents):
                elapsed = time.time() - started
                print(f"[backfill] {i}/{len(documents)} documents processed ({elapsed:.1f}s elapsed)")

        print(f"[backfill] Done. {total_entities} generic_transformer entities written across {len(documents)} documents.")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
