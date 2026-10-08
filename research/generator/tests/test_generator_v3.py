"""Run: research/generator/.venv/Scripts/python.exe -m pytest research/generator/tests -q"""

import copy
import sys
from argparse import Namespace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate_v3 as g  # noqa: E402
from v3.domains import DOMAINS  # noqa: E402
from v3.validate import rule_violations, validate  # noqa: E402

ARGS = Namespace(seed=7, core=12, adversarial=len(max((m.ADVERSARIAL for m in DOMAINS.values()), key=len)),
                 counterfactual=3, cross_domain=2)


@pytest.fixture(scope="module")
def records():
    return [r for name in DOMAINS for r in g.generate_domain(DOMAINS[name], ARGS)]


def test_every_domain_generates_and_validates(records):
    report = validate(records)
    assert report["critical"] == [], report["critical"][:5]
    assert {r["domain"] for r in records} == set(DOMAINS)


def test_same_seed_is_deterministic():
    a = g.generate_domain(DOMAINS["sale_property"], ARGS)
    b = g.generate_domain(DOMAINS["sale_property"], ARGS)
    assert [r["raw_text"] for r in a] == [r["raw_text"] for r in b]


def test_adversarial_documents_violate_their_rule_and_controls_do_not(records):
    pairs = {}
    for r in records:
        if r["split"] in ("adversarial", "control"):
            pairs.setdefault(r["pair_id"], {})[r["split"]] = r
    assert pairs
    for pair in pairs.values():
        adv, ctl = pair["adversarial"], pair["control"]
        rule = adv["consistency_expectations"][0]["rule_id"]
        assert rule_violations(adv)[rule], (adv["doc_id"], rule)
        assert not any(rule_violations(ctl).values()), ctl["doc_id"]
        assert ctl["consistency_expectations"][0]["expected_result"] == "NO_FLAG"


def test_every_adversarial_kind_is_exercised(records):
    seen = {(r["domain"], r["adversarial_kind"]) for r in records if r["split"] == "adversarial"}
    for name, mod in DOMAINS.items():
        assert {k for d, k in seen if d == name} == set(mod.ADVERSARIAL), name


def test_counterfactual_pairs_change_only_declared_facts(records):
    # Editing one fact may legitimately move values derived from it (a new
    # sale consideration moves the balance and stamp duty), but nothing else.
    cf = [r for r in records if r["split"] == "counterfactual"]
    assert cf
    for r in cf:
        changes = r["counterfactual"]["expected_changes"]
        assert changes, r["doc_id"]
        assert {c["label"] for c in changes} <= set(r["counterfactual"]["declared_effects"]), (r["doc_id"], changes)


def test_train_and_dev_never_use_heldout_templates(records):
    assert all(not r["heldout_templates"] for r in records if r["split"] in ("train", "dev"))


def test_validator_catches_corrupted_records(records):
    rec = copy.deepcopy(next(r for r in records if r["split"] == "train"))
    bad_offset = copy.deepcopy(rec)
    bad_offset["entities"][0]["end"] += 1
    leaked = copy.deepcopy(rec)
    leaked["doc_id"] += "_leak"
    leaked["heldout_templates"] = ["x#9"]
    unknown = copy.deepcopy(rec)
    unknown["doc_id"] += "_unknown"
    unknown["entities"][0]["label"] = "NOT_A_LABEL"
    dup = copy.deepcopy(rec)
    dup["doc_id"] += "_dup"
    report = validate([bad_offset, leaked, unknown, dup])
    text = " ".join(report["critical"])
    assert "entity offset" in text
    assert "held-out template" in text
    assert "unknown label" in text
    assert "exact duplicates" in text


def test_validator_catches_an_ordinary_document_that_contradicts_itself(records):
    rec = copy.deepcopy(next(r for r in records if r["domain"] == "sale_property" and r["split"] == "train"))
    money = next(m for m in rec["entities"] if m["label"] == "SALE_CONSIDERATION")
    clone = dict(money, id="m_extra", normalized={"amount": money["normalized"]["amount"] + 1, "currency": "INR"})
    rec["entities"].append(clone)
    assert any("unintended consistency violation" in c for c in validate([rec])["critical"])
