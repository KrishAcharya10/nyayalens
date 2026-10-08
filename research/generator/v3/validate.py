"""
Dataset validator for synthetic v3. `validate(records)` returns a report
with every count the dataset quality report needs, plus `critical`: a list
of failures that must stop generation (generate_v3.py exits non-zero).

Critical (generation fails):
  malformed record, invalid offsets / evidence spans, unknown labels or
  relation/clause/obligation types, dangling relation endpoints or clause
  references, impossible dates or amounts, missing required fields,
  adversarial documents whose rule is not actually violated, control or
  ordinary documents that violate a consistency rule, exact duplicates,
  held-out templates in train/dev, near-duplicate train/test pairs.
Reported (not critical): near-duplicates within a split, label / domain
  imbalance, nearest-train-neighbour similarity of test documents.
"""

import hashlib
import re
from collections import Counter, defaultdict
from datetime import date

import numpy as np

from .core import ONTOLOGY
from .domains import DOMAINS, required_labels

REQUIRED_KEYS = ["doc_id", "domain", "document_type", "template_id", "generator_version", "random_seed",
                 "difficulty", "split", "raw_text", "clauses", "entities", "relations", "obligations",
                 "temporal_facts", "financial_facts", "semantic_facts", "risks", "consistency_expectations"]
NEAR_DUP_THRESHOLD = 0.9
LEAKAGE_SIMILARITY = 0.8
SEEN = {"train", "dev"}


# --- consistency ground truth ----------------------------------------------------

def _norm_sig(m):
    return repr(sorted((m["normalized"] or {}).items()))


def rule_violations(rec: dict) -> dict[str, bool]:
    """Evaluates the domain's consistency rules on the ground-truth values."""
    onto = ONTOLOGY[rec["domain"]]
    single = {r["label"] for r in onto["consistencyRules"] if r["kind"] == "SINGLE_VALUE"}
    by_label = defaultdict(list)
    for m in rec["entities"]:
        by_label[m["label"]].append(m)
    out = {}
    for rule in onto["consistencyRules"]:
        kind, violated = rule["kind"], False
        if kind == "SINGLE_VALUE":
            groups = defaultdict(set)
            for m in by_label[rule["label"]]:
                groups[m["key"]].add(_norm_sig(m))
            violated = any(len(v) > 1 for v in groups.values())
        elif kind == "SUM":
            total = by_label[rule["total"]]
            if total and all(by_label[p] for p in rule["parts"]):
                s = 0
                for p in rule["parts"]:
                    if p in single:
                        s += by_label[p][0]["normalized"]["amount"]
                    else:  # multi-valued part: every distinct fact (key) counts once
                        firsts = {m["key"]: m for m in by_label[p]}
                        s += sum(m["normalized"]["amount"] for m in firsts.values())
                violated = s != total[0]["normalized"]["amount"]
        elif kind == "DATE_ORDER":
            before, after = by_label[rule["before"]], by_label[rule["after"]]
            if before and after:
                violated = before[0]["normalized"]["iso"] > after[0]["normalized"]["iso"]
        elif kind == "EXPECTED_ACTOR":
            violated = any(o["action"] == rule["action"] and o["amount_label"] == rule["objectLabel"]
                           and o["actor_label"] != rule["expectedActor"] for o in rec["obligations"])
        out[rule["id"]] = violated
    return out


# --- similarity ----------------------------------------------------------------------

_P = (1 << 61) - 1
_RNG = np.random.default_rng(1234)
_A = _RNG.integers(1, _P, 64, dtype=np.uint64)
_B = _RNG.integers(0, _P, 64, dtype=np.uint64)


def _shingles(text: str) -> set[int]:
    words = re.findall(r"\w+", text.lower())
    return {int.from_bytes(hashlib.blake2b(" ".join(words[i:i + 5]).encode(), digest_size=7).digest(), "big")
            for i in range(max(1, len(words) - 4))}


def _fast_minhash(arr: np.ndarray) -> np.ndarray:
    # 64 universal hashes over 32-bit shingle ids; only used to propose
    # candidate pairs - every reported similarity is an exact Jaccard.
    x = (arr & np.uint64(0xFFFFFFFF)).astype(np.uint64)
    a = (_A & np.uint64(0x7FFFFFFF))[:, None]
    b = (_B & np.uint64(0x7FFFFFFF))[:, None]
    return ((a * x[None, :] + b) % np.uint64(4294967311)).min(axis=1)


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / max(1, len(a | b))


def similar_pairs(records: list[dict], threshold: float) -> list[tuple[int, int, float]]:
    shingles = [_shingles(r["raw_text"]) for r in records]
    sigs = [_fast_minhash(np.fromiter(s, dtype=np.uint64)) for s in shingles]
    buckets = defaultdict(list)
    for i, sig in enumerate(sigs):
        for band in range(16):
            buckets[(band, sig[band * 4:(band + 1) * 4].tobytes())].append(i)
    candidates = set()
    for members in buckets.values():
        if 1 < len(members) < 400:
            for x in range(len(members)):
                for y in range(x + 1, len(members)):
                    candidates.add((members[x], members[y]))
    out = []
    for i, j in candidates:
        sim = _jaccard(shingles[i], shingles[j])
        if sim >= threshold:
            out.append((i, j, sim))
    return out


# --- validation -----------------------------------------------------------------------

def _valid_iso(s: str) -> bool:
    try:
        d = date.fromisoformat(s)
        return 2000 <= d.year <= 2075
    except (TypeError, ValueError):
        return False


def validate(records: list[dict]) -> dict:
    critical, counts = [], Counter()

    def fail(rec, msg):
        critical.append(f"{rec.get('doc_id', '?')}: {msg}")

    label_counts = defaultdict(Counter)
    relation_counts = defaultdict(Counter)
    obligation_counts = defaultdict(Counter)
    for rec in records:
        missing_keys = [k for k in REQUIRED_KEYS if k not in rec]
        if missing_keys or not rec.get("raw_text"):
            fail(rec, f"malformed (missing {missing_keys})")
            counts["malformed"] += 1
            continue
        text, onto = rec["raw_text"], ONTOLOGY[rec["domain"]]
        labels = {e["label"] for e in onto["entities"]}
        clause_types = set(onto["clauseTypes"])
        rel_types = {(r["type"], r["subject"], r["object"]) for r in onto["relations"]}
        actions = {o["action"]: set(o["actors"]) for o in onto["obligations"]}
        mention_ids = {m["id"] for m in rec["entities"]}
        clause_ids = {c["id"] for c in rec["clauses"]}

        for m in rec["entities"]:
            if text[m["start"]:m["end"]] != m["text"]:
                fail(rec, f"entity offset {m['id']}"); counts["invalid_annotation"] += 1
            if m["label"] not in labels:
                fail(rec, f"unknown label {m['label']}"); counts["invalid_annotation"] += 1
            if m["clause_id"] and m["clause_id"] not in clause_ids:
                fail(rec, f"entity clause ref {m['clause_id']}"); counts["invalid_annotation"] += 1
            nv = m["normalized"] or {}
            if m["core_type"] == "DATE" and not _valid_iso(nv.get("iso")):
                fail(rec, f"impossible date {m['text']}"); counts["impossible_date"] += 1
            if m["core_type"] == "MONEY" and not nv.get("amount", 0) > 0:
                fail(rec, f"impossible amount {m['text']}"); counts["impossible_amount"] += 1
            if m["core_type"] == "DURATION" and not nv.get("value", 0) > 0:
                fail(rec, f"impossible duration {m['text']}"); counts["impossible_duration"] += 1
            label_counts[rec["domain"]][m["label"]] += 1
        ents = sorted(rec["entities"], key=lambda m: m["start"])
        for a, b in zip(ents, ents[1:]):
            if b["start"] < a["end"]:
                fail(rec, f"overlapping entities {a['id']}/{b['id']}"); counts["invalid_annotation"] += 1
        for c in rec["clauses"]:
            if not (0 <= c["start"] < c["end"] <= len(text)) or c["label"] not in clause_types:
                fail(rec, f"bad clause {c['id']}"); counts["invalid_annotation"] += 1
        for r in rec["relations"]:
            if (r["type"], r["subject_label"], r["object_label"]) not in rel_types:
                fail(rec, f"unknown relation {r['type']}"); counts["invalid_relation"] += 1
            if (r["subject_mention"] and r["subject_mention"] not in mention_ids) or \
                    not r["object_mentions"] or any(x not in mention_ids for x in r["object_mentions"]):
                fail(rec, f"dangling relation {r['id']}"); counts["missing_relation_endpoint"] += 1
            relation_counts[rec["domain"]][r["type"]] += 1
        for o in rec["obligations"]:
            ev = o["evidence"]
            if text[ev["start"]:ev["end"]] != ev["text"]:
                fail(rec, f"obligation evidence {o['id']}"); counts["invalid_evidence"] += 1
            if o["action"] not in actions or (o["actor_label"] not in actions[o["action"]] and not o.get("role_reversal")):
                fail(rec, f"obligation {o['actor_label']} {o['action']}"); counts["invalid_annotation"] += 1
            if o["clause_id"] and o["clause_id"] not in clause_ids:
                fail(rec, f"obligation clause ref"); counts["invalid_annotation"] += 1
            obligation_counts[rec["domain"]][o["action"]] += 1
        for f in rec["semantic_facts"]:
            ev = f["evidence"]
            if text[ev["start"]:ev["end"]] != ev["text"]:
                fail(rec, f"fact evidence {f['id']}"); counts["invalid_evidence"] += 1
        for x in rec["consistency_expectations"]:
            for ev in x["expected_evidence"]:
                if text[ev["start"]:ev["end"]] != ev["text"] or ev["mention"] not in mention_ids:
                    fail(rec, f"expectation evidence {x['rule_id']}"); counts["invalid_evidence"] += 1
        for r in rec["risks"]:
            if r["clause_id"] and r["clause_id"] not in clause_ids:
                fail(rec, "risk clause ref"); counts["invalid_annotation"] += 1

        present = {m["label"] for m in rec["entities"]}
        lacking = [lbl for lbl in required_labels(DOMAINS[rec["domain"]], rec["document_type"]) if lbl not in present]
        if lacking:
            fail(rec, f"missing required fields {lacking}"); counts["missing_required_field"] += 1

        violations = rule_violations(rec)
        flagged = {x["rule_id"] for x in rec["consistency_expectations"] if x["expected_result"] == "FLAG"}
        for rule_id in flagged:
            if not violations.get(rule_id):
                fail(rec, f"adversarial rule {rule_id} not actually violated"); counts["adversarial_not_violated"] += 1
        for rule_id, v in violations.items():
            if v and rule_id not in flagged:
                fail(rec, f"unintended consistency violation {rule_id}"); counts["unintended_violation"] += 1

        if rec["split"] in SEEN and rec["heldout_templates"]:
            fail(rec, f"held-out template in {rec['split']}"); counts["template_leakage"] += 1

    # duplicates (designed pairs - adversarial/control and counterfactual - are excluded)
    by_hash = defaultdict(list)
    for r in records:
        by_hash[hashlib.sha1(r.get("raw_text", "").encode()).hexdigest()].append(r)
    for group in by_hash.values():
        if len(group) > 1 and len({r.get("pair_id") or r["doc_id"] for r in group}) > 1:
            counts["exact_duplicate"] += len(group) - 1
            critical.append(f"exact duplicates: {[r['doc_id'] for r in group]}")

    pairs = similar_pairs(records, LEAKAGE_SIMILARITY)
    near_dups = leak = similar_test = 0
    for i, j, sim in pairs:
        a, b = records[i], records[j]
        if a.get("pair_id") and a.get("pair_id") == b.get("pair_id"):
            continue
        if sim >= NEAR_DUP_THRESHOLD:
            near_dups += 1
        splits = {a["split"], b["split"]}
        if splits == {"train", "test"}:
            similar_test += 1
            if sim >= NEAR_DUP_THRESHOLD:
                leak += 1
                critical.append(f"train/test near-duplicate: {a['doc_id']} ~ {b['doc_id']} ({sim:.2f})")
    counts["near_duplicate_pairs"] = near_dups
    counts["train_test_leakage"] = leak
    counts["train_test_pairs_above_0.8"] = similar_test

    return {
        "documents": len(records),
        "critical_failures": len(critical),
        "critical_examples": critical[:25],
        "counts": dict(counts),
        "entity_label_counts": {d: dict(c) for d, c in label_counts.items()},
        "relation_counts": {d: dict(c) for d, c in relation_counts.items()},
        "obligation_counts": {d: dict(c) for d, c in obligation_counts.items()},
        "critical": critical,
    }
