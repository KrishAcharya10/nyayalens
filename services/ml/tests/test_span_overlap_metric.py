"""
Unit tests for compute_span_overlap_prf in isolation - known synthetic
spans with hand-computed expected IoU/overlap outcomes, not an
end-to-end run. See services/ml/metrics.py for why this exists (the
Phase 4B addendum on generic_transformer scoring).
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from metrics import _iou, compute_span_overlap_prf  # noqa: E402


def test_iou_of_identical_spans_is_one():
    assert _iou((10, 20), (10, 20)) == 1.0


def test_iou_of_disjoint_spans_is_zero():
    assert _iou((0, 10), (20, 30)) == 0.0


def test_iou_of_half_overlapping_spans():
    # (0,10) and (5,15): intersection = 5, union = 10+10-5 = 15
    assert _iou((0, 10), (5, 15)) == 5 / 15


def test_perfect_match_scores_one_across_the_board():
    result = compute_span_overlap_prf(predicted_spans=[(0, 10)], gold_spans=[(0, 10)])
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0
    assert result["f1"] == 1.0
    assert result["true_positives"] == 1


def test_no_predictions_gives_zero_recall_and_zero_precision():
    result = compute_span_overlap_prf(predicted_spans=[], gold_spans=[(0, 10), (20, 30)])
    assert result["precision"] == 0.0
    assert result["recall"] == 0.0
    assert result["support"] == 2
    assert result["predicted_count"] == 0


def test_no_gold_spans_gives_zero_recall_and_zero_precision_regardless_of_predictions():
    result = compute_span_overlap_prf(predicted_spans=[(0, 10)], gold_spans=[])
    assert result["precision"] == 0.0
    assert result["recall"] == 0.0
    assert result["support"] == 0


def test_below_threshold_overlap_does_not_count_as_a_match():
    # (0,10) vs (8,18): intersection=2, union=18, iou=2/18=0.111 < 0.5
    result = compute_span_overlap_prf(predicted_spans=[(8, 18)], gold_spans=[(0, 10)])
    assert result["true_positives"] == 0
    assert result["recall"] == 0.0


def test_above_threshold_overlap_counts_as_a_match():
    # (0,10) vs (3,13): intersection=7, union=13, iou=7/13=0.538 >= 0.5
    result = compute_span_overlap_prf(predicted_spans=[(3, 13)], gold_spans=[(0, 10)])
    assert result["true_positives"] == 1
    assert result["recall"] == 1.0


def test_fragmented_wordpiece_predictions_do_not_double_count_one_gold_span():
    # "Pat" (0,3) and "##na" (3,6) both overlap gold "Patna" (0,6), but
    # only ONE of them can match under greedy one-to-one pairing - this is
    # exactly the wordpiece-fragmentation pattern observed in the real
    # generic_transformer output (e.g. "Pat"/"##na" for "Patna").
    result = compute_span_overlap_prf(predicted_spans=[(0, 3), (3, 6)], gold_spans=[(0, 6)])
    assert result["true_positives"] == 1
    assert result["support"] == 1
    assert result["predicted_count"] == 2
    # precision is depressed by the second, unmatched fragment
    assert result["precision"] == 0.5
    assert result["recall"] == 1.0


def test_iou_threshold_is_configurable():
    # (0,10) vs (3,13): iou = 7/13 = 0.538 - matches at 0.5 but not at 0.6
    result_default = compute_span_overlap_prf(predicted_spans=[(3, 13)], gold_spans=[(0, 10)])
    result_stricter = compute_span_overlap_prf(
        predicted_spans=[(3, 13)], gold_spans=[(0, 10)], iou_threshold=0.6
    )
    assert result_default["true_positives"] == 1
    assert result_stricter["true_positives"] == 0
