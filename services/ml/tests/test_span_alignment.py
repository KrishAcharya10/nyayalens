"""
Unit tests for span_alignment.map_gold_spans_to_text in isolation.
"""

import pathlib
import sys
from dataclasses import dataclass

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from span_alignment import map_gold_spans_to_text  # noqa: E402


@dataclass
class FakeEntity:
    text: str


def test_single_occurrence_maps_exactly():
    target = "LESSOR: Chatura Chada, hereinafter"
    spans = map_gold_spans_to_text([FakeEntity(text="Chatura Chada")], target)
    assert spans == [(8, 21)]
    assert target[8:21] == "Chatura Chada"


def test_duplicate_text_maps_to_successive_occurrences_in_order():
    target = "Survey No. 328/B is unencumbered. See Survey No. 328/B again."
    spans = map_gold_spans_to_text([FakeEntity(text="328/B"), FakeEntity(text="328/B")], target)
    assert len(spans) == 2
    assert spans[0] != spans[1]
    assert target[spans[0][0] : spans[0][1]] == "328/B"
    assert target[spans[1][0] : spans[1][1]] == "328/B"
    assert spans[0][0] < spans[1][0]


def test_text_not_present_is_omitted_not_fabricated():
    spans = map_gold_spans_to_text([FakeEntity(text="Nonexistent Name")], "some other text entirely")
    assert spans == []


def test_currency_symbol_fallback_matches_stripped_text():
    # Mirrors the real PDF-extraction artifact (rupee glyph mangled) that
    # metrics.py's _normalize also works around.
    target = "The Tenant agrees to remit a sum of   n 10,500 per month"
    spans = map_gold_spans_to_text([FakeEntity(text="₹10,500")], target)
    assert len(spans) == 1
    start, end = spans[0]
    assert target[start:end] == "10,500"


def test_more_gold_occurrences_than_found_are_simply_dropped():
    target = "only one match here"
    spans = map_gold_spans_to_text(
        [FakeEntity(text="match"), FakeEntity(text="match"), FakeEntity(text="match")], target
    )
    assert len(spans) == 1
