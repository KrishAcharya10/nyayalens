"""
Generic transformer NER baseline (Phase 4A, model_source=generic_transformer).

Deliberately NOT fine-tuned on NyayaLens data and NOT a legal-domain
model - it is a stock, off-the-shelf pretrained token-classification
model (dslim/distilbert-NER: CoNLL-2003 PER/ORG/LOC/MISC), run purely
for inference. This is the second baseline Phase 4B's evaluation compares
against rule_based and fine_tuned.

Two entry points:
  - CLI (stateless, one document per process): reads {"text": "..."} as
    JSON from stdin, writes a JSON array of entity candidates to stdout.
    Used by apps/api/src/ner/genericTransformerNer.ts for live uploads -
    one document at a time is fine there since uploads aren't bulk.
  - `load_ner_pipeline()` / `run_ner(pipeline, text)`: importable by a
    batch caller (see backfill_generic_transformer.py) that wants to load
    the model ONCE and run it over many documents - reloading per
    document (as the CLI path does) costs ~10s of fixed overhead each
    time purely in torch/transformers import + model load, which is fine
    for one live upload but far too slow for 300 documents sequentially.

All Postgres persistence is done by the caller - this module never
touches the database itself, so a single inference path serves both the
live per-document pipeline and bulk evaluation backfills without divergence.

IMPORTANT (report honestly, do not silently relabel): this model's output
labels (PER, ORG, LOC, MISC) are its own general-purpose categories, NOT
NyayaLens's domain ontology (LESSOR, LESSEE, RENT, SURVEY_NUMBER, ...).
Forcing e.g. every PER span into "LESSOR" would fabricate information the
model was never asked for and never determined (it cannot tell a lessor
from a lessee from a witness). Labels are passed through as-is, prefixed
`GENERIC_` to make the vocabulary mismatch impossible to miss downstream.
"""

import json
import sys

MODEL_NAME = "dslim/distilbert-NER"


def load_ner_pipeline():
    from transformers import pipeline

    return pipeline("ner", model=MODEL_NAME, aggregation_strategy="simple")


def run_ner(ner_pipeline, text: str) -> list[dict]:
    if not text.strip():
        return []

    results = ner_pipeline(text)

    return [
        {
            "label": f"GENERIC_{r['entity_group']}",
            "text": r["word"],
            "start": int(r["start"]),
            "end": int(r["end"]),
            "confidence": float(r["score"]),
            "modelName": MODEL_NAME,
        }
        for r in results
    ]


def main() -> None:
    # utf-8-sig tolerates a leading BOM (some shells/pipes add one) while
    # behaving identically to utf-8 when there isn't one.
    raw = sys.stdin.buffer.read().decode("utf-8-sig")
    payload = json.loads(raw)
    text = payload.get("text", "")

    ner_pipeline = load_ner_pipeline()
    entities = run_ner(ner_pipeline, text)

    print(json.dumps(entities, ensure_ascii=False))


if __name__ == "__main__":
    main()
