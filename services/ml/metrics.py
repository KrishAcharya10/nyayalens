"""
Precision/recall/F1 by CONTENT match (label + exact text), not character
offset. Character offsets are not directly comparable across model
sources here: ground truth offsets are computed against the original
research/data/synthetic/*.txt text, while rule_based/generic_transformer
predictions are computed against apps/api's PDF-extracted canonical_text
- a real, verified difference (whitespace normalization differs enough
between the two extraction paths that offsets drift over a document's
length; see docs/architecture/evaluation_results.md for the concrete
example that surfaced this). Matching on (label, exact text) side-steps
that mismatch and remains a standard, defensible NER evaluation choice
when positional alignment across pipelines isn't guaranteed.

Multiset (Counter) intersection handles duplicate values correctly - a
land lease document's SURVEY_NUMBER legitimately appears twice (see
research/generator/generator.py's ENCUMBRANCE_DECLARATION clause), and
counting rather than positional pairing scores both occurrences without
needing to decide which specific occurrence "belongs" to which.

Text is normalized (leading currency symbol stripped) before comparison
- a second real finding from evaluation, not just the offset one above:
apps/api's rule-based amount pattern has a fallback that recovers a
value like "32,000" without its currency symbol when the PDF's font
encoding mangles "₹" (see extraction_pipeline.md's "A real PDF-extraction
bug this surfaced"). Ground truth always has the symbol ("₹32,000"). Without
normalizing, a correctly-recovered amount scores as a complete miss purely
because of that missing symbol - not because the extractor found the
wrong value. This is why RENT/SECURITY_DEPOSIT/LEASE_PREMIUM initially
showed 0 precision/recall for rule_based despite the values being right;
see evaluation_results.md for the before/after this normalization made.
"""

import re
from collections import Counter


def _normalize(text: str) -> str:
    return re.sub(r"^[₹]\s*", "", text).strip()


def compute_prf(predicted: list[tuple[str, str]], ground_truth: list[tuple[str, str]]) -> dict[str, dict]:
    """predicted/ground_truth: lists of (label, text) tuples for one
    fold's test-set documents, pooled together. Returns label -> metrics."""
    pred_by_label: dict[str, list[str]] = {}
    gt_by_label: dict[str, list[str]] = {}
    for label, text in predicted:
        pred_by_label.setdefault(label, []).append(_normalize(text))
    for label, text in ground_truth:
        gt_by_label.setdefault(label, []).append(_normalize(text))

    all_labels = set(pred_by_label) | set(gt_by_label)
    results = {}
    for label in all_labels:
        pred_counter = Counter(pred_by_label.get(label, []))
        gt_counter = Counter(gt_by_label.get(label, []))
        true_positives = sum((pred_counter & gt_counter).values())
        predicted_count = sum(pred_counter.values())
        support = sum(gt_counter.values())

        precision = true_positives / predicted_count if predicted_count else 0.0
        recall = true_positives / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

        results[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
            "predicted_count": predicted_count,
            "true_positives": true_positives,
        }
    return results
