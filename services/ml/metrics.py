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
    # The v2 dataset (research/generator/generator_v2.py) also writes
    # amounts as "Rs. 8,90,000" / "INR 8,90,000", so any of those currency
    # markers is stripped, not just the rupee sign. Identical to the
    # original behavior on v1 data, which only ever uses "₹".
    return re.sub(r"^(?:₹|Rs\.?|INR)\s*", "", text).strip()


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


# --- Span-overlap scoring (generic_transformer only - see the Phase 4B ---
# addendum this was added for). compute_prf above is label-exact and stays
# the standard for rule_based/fine_tuned, where demanding the right label
# is fair. generic_transformer's own labels (GENERIC_PER/LOC/ORG/MISC) are
# a different vocabulary from the domain ontology by policy (see
# extraction_pipeline.md - never force-mapped), which makes compute_prf
# score it 0.000 on every domain label regardless of whether its predicted
# span BOUNDARIES are any good. This function answers that separate
# question label-agnostically: does some prediction's span overlap a gold
# span, ignoring what either is labeled.

IOU_THRESHOLD = 0.5


def _iou(a: tuple[int, int], b: tuple[int, int]) -> float:
    a_start, a_end = a
    b_start, b_end = b
    intersection = max(0, min(a_end, b_end) - max(a_start, b_start))
    union = (a_end - a_start) + (b_end - b_start) - intersection
    return intersection / union if union > 0 else 0.0


def compute_span_overlap_prf(
    predicted_spans: list[tuple[int, int]],
    gold_spans: list[tuple[int, int]],
    iou_threshold: float = IOU_THRESHOLD,
) -> dict:
    """Label-agnostic, IoU>=iou_threshold, greedy one-to-one matching (a
    predicted span can satisfy at most one gold span and vice versa, so a
    cluster of overlapping predictions - e.g. wordpiece-fragmented output
    like "Pat"/"##na" - can't each separately "count" against the same
    gold span and inflate recall)."""
    pairs = sorted(
        (
            (_iou(gold_spans[gi], predicted_spans[pi]), gi, pi)
            for gi in range(len(gold_spans))
            for pi in range(len(predicted_spans))
            if _iou(gold_spans[gi], predicted_spans[pi]) >= iou_threshold
        ),
        key=lambda item: -item[0],
    )

    matched_gold: set[int] = set()
    matched_pred: set[int] = set()
    true_positives = 0
    for _iou_value, gi, pi in pairs:
        if gi in matched_gold or pi in matched_pred:
            continue
        matched_gold.add(gi)
        matched_pred.add(pi)
        true_positives += 1

    predicted_count = len(predicted_spans)
    support = len(gold_spans)
    precision = true_positives / predicted_count if predicted_count else 0.0
    recall = true_positives / support if support else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "support": support,
        "predicted_count": predicted_count,
        "true_positives": true_positives,
        "iou_threshold": iou_threshold,
    }
