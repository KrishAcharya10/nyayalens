"""
Generic transformer NER baseline (Phase 4A, model_source=generic_transformer).

Deliberately NOT fine-tuned on NyayaLens data and NOT a legal-domain
model - it is a stock, off-the-shelf pretrained token-classification
model (dslim/distilbert-NER: CoNLL-2003 PER/ORG/LOC/MISC), run purely
for inference. This is the second baseline Phase 4B's evaluation compares
against rule_based and (later) fine_tuned.

Stateless by design: reads {"text": "..."} as JSON from stdin, writes a
JSON array of entity candidates to stdout. All Postgres persistence is
done by the Node.js caller (apps/api/src/jobs/pipeline.ts) - this script
never touches the database, so the extraction pipeline's DB access stays
in one place (Node) rather than split across two languages.

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


def main() -> None:
    # utf-8-sig tolerates a leading BOM (some shells/pipes add one) while
    # behaving identically to utf-8 when there isn't one.
    raw = sys.stdin.buffer.read().decode("utf-8-sig")
    payload = json.loads(raw)
    text = payload.get("text", "")

    if not text.strip():
        print(json.dumps([]))
        return

    # Imported here, not at module load, so `--help`-style invocations and
    # import errors in the caller don't pay transformers' import cost.
    from transformers import pipeline

    ner = pipeline(
        "ner",
        model=MODEL_NAME,
        aggregation_strategy="simple",
    )

    results = ner(text)

    entities = [
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

    print(json.dumps(entities, ensure_ascii=False))


if __name__ == "__main__":
    main()
