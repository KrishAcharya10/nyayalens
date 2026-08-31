"""
Char-offset entities <-> BIO token tags, shared by fine-tuning (encoding
ground truth into training labels) and evaluation (decoding a fine-tuned
model's predictions back into character-offset entities so they're
comparable to rule_based/generic_transformer output and ground truth,
all of which are expressed as character offsets - see
docs/architecture/provenance.md).
"""

from dataset import GroundTruthDocument


def build_label_list(entity_labels: list[str]) -> list[str]:
    """["RENT", "DURATION"] -> ["O", "B-RENT", "I-RENT", "B-DURATION", "I-DURATION"]"""
    labels = ["O"]
    for label in entity_labels:
        labels.append(f"B-{label}")
        labels.append(f"I-{label}")
    return labels


def encode_tags(document: GroundTruthDocument, offset_mapping: list[tuple[int, int]]) -> list[int | None]:
    """
    Returns one BIO tag string per token offset (None for special tokens,
    i.e. offsets (0, 0)). A token is tagged B-<label> if it's the first
    token whose span overlaps a given entity, I-<label> for subsequent
    overlapping tokens, "O" otherwise.
    """
    tags: list[str | None] = []
    for start, end in offset_mapping:
        if start == end:  # special token ([CLS], [SEP], padding)
            tags.append(None)
            continue

        tag = "O"
        for entity in document.entities:
            if start < entity.end and end > entity.start:
                is_first_token = start <= entity.start
                tag = f"{'B' if is_first_token else 'I'}-{entity.label}"
                break
        tags.append(tag)
    return tags


def decode_predictions(
    text: str, offset_mapping: list[tuple[int, int]], predicted_labels: list[str]
) -> list[dict]:
    """Inverse of encode_tags: merges consecutive B-X/I-X tokens (by
    contiguous offsets) back into character-offset entity spans."""
    entities: list[dict] = []
    current: dict | None = None

    for (start, end), label in zip(offset_mapping, predicted_labels, strict=True):
        if start == end:
            continue

        if label == "O":
            current = None
            continue

        prefix, _, entity_label = label.partition("-")
        if prefix == "B" or current is None or current["label"] != entity_label:
            current = {"label": entity_label, "start": start, "end": end}
            entities.append(current)
        else:  # "I-" continuing the same entity
            current["end"] = end

    for e in entities:
        e["text"] = text[e["start"] : e["end"]]
    return entities
