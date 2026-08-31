"""
Maps ground-truth entity spans (offsets into the original
research/data/synthetic/*.txt) into the coordinate space of a different
text - specifically apps/api's PDF-extracted canonical_text - by locating
each gold entity's TEXT content within the target text. Needed only for
the generic_transformer span-overlap addendum (services/ml/metrics.py's
compute_span_overlap_prf): its predicted spans are offsets into
canonical_text, so gold spans must be expressed in that same space before
an IoU comparison means anything. rule_based/fine_tuned scoring uses
content-match (metrics.compute_prf) and never needs this - see
evaluation_results.md for why offsets aren't directly comparable across
these two text extraction paths in general.

Documented simplification, not hidden: when a document has multiple gold
entities sharing identical text (e.g. a land lease's SURVEY_NUMBER
appearing twice - see research/generator/generator.py's
ENCUMBRANCE_DECLARATION clause), each occurrence is mapped to the
canonical_text match at the same ordinal position (1st gold "328/B" -> 1st
occurrence found in canonical_text, 2nd -> 2nd, ...) rather than solving
an exact positional-alignment problem. For the overwhelming majority of
entities, which appear exactly once, this is exact regardless.
"""

import re


def _find_all_occurrences(haystack: str, needle: str) -> list[tuple[int, int]]:
    if not needle:
        return []
    spans = []
    start = 0
    while True:
        idx = haystack.find(needle, start)
        if idx == -1:
            break
        spans.append((idx, idx + len(needle)))
        start = idx + 1
    return spans


def map_gold_spans_to_text(entities, target_text: str) -> list[tuple[int, int]]:
    """entities: list of dataset.GroundTruthEntity. Returns one (start,
    end) span per gold entity that could be located in target_text - an
    entity whose text doesn't appear verbatim (e.g. the currency-symbol
    PDF-extraction artifact metrics.py's _normalize also works around) is
    simply omitted, never assigned a fabricated position."""
    occurrences_by_text: dict[str, list[tuple[int, int]]] = {}
    next_index_by_text: dict[str, int] = {}
    mapped: list[tuple[int, int]] = []

    for entity in entities:
        text = entity.text
        if text not in occurrences_by_text:
            occurrences = _find_all_occurrences(target_text, text)
            if not occurrences:
                stripped = re.sub(r"^[₹]\s*", "", text)
                if stripped != text:
                    occurrences = _find_all_occurrences(target_text, stripped)
            occurrences_by_text[text] = occurrences
            next_index_by_text[text] = 0

        idx = next_index_by_text[text]
        occurrences = occurrences_by_text[text]
        if idx < len(occurrences):
            mapped.append(occurrences[idx])
        next_index_by_text[text] += 1

    return mapped
