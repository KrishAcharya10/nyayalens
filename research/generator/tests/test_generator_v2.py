"""Run: research/generator/.venv/Scripts/python.exe -m pytest research/generator/tests -q"""

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generator_v2 as g  # noqa: E402
import value_pools_v2 as vp  # noqa: E402

BUILDERS = [g.build_residential_rental, g.build_land_lease]


def build_many(seed: int, n: int, split: str = "train"):
    vp.seed_all(seed)
    out = []
    for i in range(n):
        doc, builder = BUILDERS[i % 2](f"d{i}", split, g.HEADING_STYLES[i % len(g.HEADING_STYLES)])
        out.append((doc, builder))
    return out


@pytest.mark.parametrize("split", ["train", "test"])
def test_every_document_passes_validation(split):
    for doc, _ in build_many(seed=11, n=300, split=split):
        assert g.validate(doc) == [], doc.doc_id


def test_same_seed_reproduces_identical_documents():
    a = [d.text for d, _ in build_many(seed=5, n=20)]
    b = [d.text for d, _ in build_many(seed=5, n=20)]
    c = [d.text for d, _ in build_many(seed=6, n=20)]
    assert a == b
    assert a != c


def test_train_and_dev_never_use_heldout_templates():
    for split in ("train", "dev"):
        for _, builder in build_many(seed=3, n=200, split=split):
            assert builder.heldout_templates == []


def test_test_split_does_use_heldout_templates():
    used = sum(len(b.heldout_templates) for _, b in build_many(seed=3, n=100, split="test"))
    assert used > 0


def test_injected_risks_are_recorded_against_a_real_clause():
    seen = set()
    for doc, _ in build_many(seed=9, n=400):
        clause_types = {c.label for c in doc.clauses}
        for risk in doc.metadata["injected_risks"]:
            assert risk["clause_type"] in clause_types
            seen.add(risk["category"])
    assert seen == {"LIABILITY_SHIFT", "UNBOUNDED_DISCRETION", "ASYMMETRIC_OBLIGATION", "LAND_USE_CONTRADICTION"}


def test_validate_catches_wrong_domain_vocabulary_and_geography():
    vp.seed_all(1)
    doc, _ = g.build_land_lease("x", "train", "numbered_caps")
    doc.text += "The Landlord agrees."
    doc.metadata["city"] = "Mumbai"
    doc.metadata["state"] = "Kerala"
    problems = " ".join(g.validate(doc))
    assert "wrong-domain party term" in problems
    assert "is not in Kerala" in problems


@pytest.mark.parametrize("n,expected", [(500, "500"), (25000, "25,000"), (890000, "8,90,000"), (12345678, "1,23,45,678")])
def test_indian_digit_grouping(n, expected):
    assert vp.indian_group(n) == expected


def test_amount_in_words():
    assert vp.amount_in_words(890000) == "Eight Lakh Ninety Thousand"
    assert vp.amount_in_words(12500) == "Twelve Thousand Five Hundred"
    assert vp.amount_in_words(23000000) == "Two Crore Thirty Lakh"


def test_add_months_clamps_to_month_end():
    assert g.add_months(date(2025, 1, 31), 1) == date(2025, 2, 27)
    assert g.add_months(date(2025, 4, 1), 11) == date(2026, 2, 28)
    assert g.add_months(date(2024, 3, 15), 12) == date(2025, 3, 14)
