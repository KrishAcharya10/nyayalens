"""
Synthetic dataset v3 - all seven NyayaLens domains, eleven annotation layers.

    research/generator/.venv/Scripts/python.exe research/generator/generate_v3.py \
        --core 300 --adversarial 80 --counterfactual 20 --cross-domain 20 --stage final

Per domain:
  core           train/dev/test (70/15/15) - template-aware: train and dev never use
                 held-out template variants; test uses them about half the time
  adversarial    one injected inconsistency each (category cycles through the domain's kinds)
  control        the adversarial document's matched control: same seed, no inconsistency
  counterfactual pairs differing in exactly one fact; expected annotation changes recorded
  cross_domain   HARD documents with generic titles ("AGREEMENT") for domain detection

Writes research/data/synthetic_v3/ (git-ignored, reproducible from --seed) and
research/data/reports/dataset_quality[_<stage>].json. Exits non-zero if the
validator reports any critical failure. --write-card also writes docs/dataset_card.md.
"""

import argparse
import json
import random
import sys
import zlib
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import value_pools_v2 as vp  # noqa: E402
from value_pools_v2 import rng  # noqa: E402
from v3.core import GENERATOR_VERSION, DocBuilder  # noqa: E402
from v3.domains import DOMAINS, allowed_document_types  # noqa: E402
from v3.qa import build_questions  # noqa: E402
from v3.validate import validate  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DIFFICULTIES = [("EASY", 0.3), ("MEDIUM", 0.4), ("HARD", 0.3)]


def doc_seed(base: int, *parts) -> int:
    return base * 1_000_003 + zlib.crc32("|".join(map(str, parts)).encode())


def pick_weighted(r: random.Random, options):
    return r.choices([o for o, _ in options], [w for _, w in options])[0]


def build(mod, *, seed, doc_id, split, difficulty, document_type, inject=None, active=False, overrides=None,
          generic_title=False) -> dict:
    vp.seed_all(seed)
    b = DocBuilder(doc_id=doc_id, domain=mod.DOMAIN, document_type=document_type, split=split, difficulty=difficulty,
                   seed=seed, inject=inject, inject_active=active, overrides=overrides, generic_title=generic_title)
    rec = b.finish(mod.build(b))
    return rec


def splits_for(n: int, r: random.Random) -> list[str]:
    out = ["train"] * round(n * 0.7) + ["dev"] * round(n * 0.15)
    out += ["test"] * (n - len(out))
    r.shuffle(out)
    return out


def fact_diff(a: dict, b: dict) -> list[dict]:
    """What a counterfactual edit changed, by fact key."""
    def by_key(rec):
        out = {}
        for m in rec["entities"]:
            if m["key"]:
                out.setdefault((m["label"], m["key"]), set()).add(json.dumps(m["normalized"], sort_keys=True))
        return out
    ka, kb = by_key(a), by_key(b)
    changes = []
    for k in sorted(set(ka) | set(kb)):
        if ka.get(k) != kb.get(k):
            changes.append({"label": k[0], "key": k[1],
                            "before": [json.loads(x) for x in sorted(ka.get(k, set()))],
                            "after": [json.loads(x) for x in sorted(kb.get(k, set()))]})
    return [c for c in changes if c["label"] != "WITNESS"]


def generate_domain(mod, args) -> list[dict]:
    name = mod.DOMAIN
    plan_rng = random.Random(doc_seed(args.seed, name, "plan"))
    records = []

    for i, split in enumerate(splits_for(args.core, plan_rng)):
        seed = doc_seed(args.seed, name, "core", i)
        r = random.Random(seed)
        records.append(build(mod, seed=seed, doc_id=f"{name}_core_{i:04d}", split=split,
                             difficulty=pick_weighted(r, DIFFICULTIES),
                             document_type=pick_weighted(r, mod.DOCUMENT_TYPES)))

    kinds = list(mod.ADVERSARIAL)
    for i in range(args.adversarial):
        kind = kinds[i % len(kinds)]
        seed = doc_seed(args.seed, name, "adv", i)
        r = random.Random(seed)
        dt = pick_weighted(r, allowed_document_types(mod, kind))
        difficulty = pick_weighted(r, DIFFICULTIES)
        pair_id = f"{name}_adv_{i:04d}"
        for active, split in ((True, "adversarial"), (False, "control")):
            rec = build(mod, seed=seed, doc_id=f"{pair_id}_{'a' if active else 'c'}", split=split,
                        difficulty=difficulty, document_type=dt, inject=kind, active=active)
            rec["pair_id"], rec["adversarial_kind"] = pair_id, kind
            rec["expected_risk"] = mod.ADVERSARIAL[kind]
            rec["expected_control_result"] = "FLAG" if active else "NO_FLAG"
            records.append(rec)

    cf_names = list(mod.COUNTERFACTUALS)
    for i in range(args.counterfactual):
        cf = cf_names[i % len(cf_names)]
        pair_id = f"{name}_cf_{i:04d}"
        effects = mod.COUNTERFACTUAL_EFFECTS[cf]
        # The target fact can be absent from a given document (an optional
        # clause not drawn); try the next seed rather than emit a pair that
        # differs in nothing.
        for attempt in range(20):
            seed = doc_seed(args.seed, name, "cf", i, attempt)
            r = random.Random(seed)
            need = getattr(mod, "COUNTERFACTUAL_REQUIRES", {}).get(cf)
            dts = [(d, w) for d, w in mod.DOCUMENT_TYPES if not need or d in need]
            dt, difficulty = pick_weighted(r, dts), pick_weighted(r, DIFFICULTIES)
            # inject="COUNTERFACTUAL" is not an adversarial kind; it only switches off
            # the optional unfair variants, so the edited fact is always written.
            a = build(mod, seed=seed, doc_id=f"{pair_id}_a", split="counterfactual", difficulty=difficulty,
                      document_type=dt, inject="COUNTERFACTUAL")
            new_value = mod.COUNTERFACTUALS[cf](a["values"][cf])
            b = build(mod, seed=seed, doc_id=f"{pair_id}_b", split="counterfactual", difficulty=difficulty,
                      document_type=dt, inject="COUNTERFACTUAL", overrides={cf: new_value})
            changes = fact_diff(a, b)
            if changes:
                break
        else:
            raise SystemExit(f"[ABORT] counterfactual {pair_id} ({cf}) changed nothing in 20 attempts")
        stray = {c["label"] for c in changes} - effects
        if stray:
            raise SystemExit(f"[ABORT] counterfactual {pair_id} ({cf}) changed undeclared facts {stray}")
        for rec in (a, b):
            rec["pair_id"] = pair_id
            rec["counterfactual"] = {"name": cf, "from": a["values"][cf], "to": new_value,
                                     "declared_effects": sorted(effects), "expected_changes": changes}
        records += [a, b]

    for i in range(args.cross_domain):
        seed = doc_seed(args.seed, name, "cross", i)
        r = random.Random(seed)
        records.append(build(mod, seed=seed, doc_id=f"{name}_cross_{i:04d}", split="cross_domain", difficulty="HARD",
                             document_type=pick_weighted(r, mod.DOCUMENT_TYPES), generic_title=True))
    return records


def write_outputs(records: list[dict], qa: list[dict], args) -> None:
    import render_v2 as render

    out = args.out
    for rec in records:
        d = out / rec["domain"] / rec["split"]
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{rec['doc_id']}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
        (d / f"{rec['doc_id']}.txt").write_text(rec["raw_text"], encoding="utf-8", newline="\n")
        rec["files"] = {"json": f"{rec['domain']}/{rec['split']}/{rec['doc_id']}.json",
                        "text": f"{rec['domain']}/{rec['split']}/{rec['doc_id']}.txt"}
        if args.render:
            vp.seed_all(rec["random_seed"] + 7)
            layout = render.random_layout()
            fmt = "native"
            if rec["split"] in ("train", "dev", "test"):
                fmt = rng.choices(["native", "scanned", "docx"], [0.8, 0.1, 0.1])[0]
            pdf = d / f"{rec['doc_id']}.pdf"
            (render.render_scanned_pdf if fmt == "scanned" else render.render_pdf)(rec["raw_text"], str(pdf), layout)
            rec["files"]["pdf"] = f"{rec['domain']}/{rec['split']}/{rec['doc_id']}.pdf"
            if fmt == "docx":
                render.render_docx(rec["raw_text"], str(d / f"{rec['doc_id']}.docx"), layout)
                rec["files"]["docx"] = f"{rec['domain']}/{rec['split']}/{rec['doc_id']}.docx"
            rec["render"] = fmt

    manifest_keys = ["doc_id", "domain", "document_type", "split", "difficulty", "template_id", "random_seed",
                     "pair_id", "adversarial_kind", "expected_risk", "expected_control_result", "render", "files"]
    with open(out / "manifest.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for rec in records:
            f.write(json.dumps({k: rec.get(k) for k in manifest_keys}, ensure_ascii=False) + "\n")
    (out / "qa").mkdir(exist_ok=True)
    with open(out / "qa" / "qa_benchmark.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for q in qa:
            f.write(json.dumps(q, ensure_ascii=False) + "\n")
    (out / "splits").mkdir(exist_ok=True)
    groups = defaultdict(list)
    for rec in records:
        groups[rec["split"]].append(rec["doc_id"])
        if rec["split"] == "test":
            groups["mixed_test"].append(rec["doc_id"])
        if rec["split"] == "cross_domain":
            groups["cross_domain_test"].append(rec["doc_id"])
    for name, ids in groups.items():
        (out / "splits" / f"{name}.txt").write_text("\n".join(ids) + "\n", encoding="utf-8", newline="\n")


def quality_report(records, qa, validation, args) -> dict:
    by = lambda key: dict(Counter(r[key] for r in records))  # noqa: E731
    lengths = [len(r["raw_text"].split()) for r in records]
    domains = defaultdict(lambda: Counter())
    for r in records:
        domains[r["domain"]][r["split"]] += 1
    risk_dist = Counter(x["category"] for r in records for x in r["risks"])
    expect_dist = Counter(f"{x['category']}:{x['expected_result']}" for r in records for x in r["consistency_expectations"])
    n = len(records)
    c = validation["counts"]
    return {
        "generator_version": GENERATOR_VERSION, "stage": args.stage, "seed": args.seed,
        "parameters": {"core": args.core, "adversarial_pairs": args.adversarial,
                       "counterfactual_pairs": args.counterfactual, "cross_domain": args.cross_domain},
        "total_documents": n,
        "documents_per_domain": by("domain"),
        "documents_per_domain_and_split": {d: dict(s) for d, s in domains.items()},
        "documents_per_document_type": by("document_type"),
        "documents_per_split": by("split"),
        "difficulty_distribution": by("difficulty"),
        "template_distribution": {
            "distinct_template_ids": len({r["template_id"] for r in records}),
            "documents_using_heldout_templates": sum(1 for r in records if r["heldout_templates"]),
            "test_documents_using_heldout_templates": sum(1 for r in records if r["split"] == "test" and r["heldout_templates"]),
        },
        "average_document_length_words": round(sum(lengths) / max(1, n), 1),
        "entities_per_label": validation["entity_label_counts"],
        "relations_per_type": validation["relation_counts"],
        "obligations_per_action": validation["obligation_counts"],
        "risk_distribution": dict(risk_dist),
        "consistency_expectations": dict(expect_dist),
        "qa_benchmark": {"total": len(qa), "by_type": dict(Counter(q["type"] for q in qa))},
        "duplicate_rate": round(c.get("exact_duplicate", 0) / max(1, n), 4),
        "near_duplicate_pairs": c.get("near_duplicate_pairs", 0),
        "near_duplicate_rate": round(c.get("near_duplicate_pairs", 0) / max(1, n), 4),
        "invalid_annotation_count": sum(c.get(k, 0) for k in ("invalid_annotation", "invalid_evidence", "invalid_relation",
                                                               "missing_relation_endpoint", "malformed")),
        "train_test_leakage_count": c.get("train_test_leakage", 0),
        "template_leakage_count": c.get("template_leakage", 0),
        "train_test_pairs_jaccard_ge_0.8": c.get("train_test_pairs_above_0.8", 0),
        "critical_failures": validation["critical_failures"],
        "critical_examples": validation["critical_examples"],
        "validator_counts": c,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--core", type=int, default=300)
    p.add_argument("--adversarial", type=int, default=80, help="adversarial/control pairs per domain")
    p.add_argument("--counterfactual", type=int, default=20, help="counterfactual pairs per domain")
    p.add_argument("--cross-domain", type=int, default=20)
    p.add_argument("--seed", type=int, default=2026)
    p.add_argument("--domains", nargs="*", default=list(DOMAINS))
    p.add_argument("--out", type=Path, default=REPO / "research" / "data" / "synthetic_v3")
    p.add_argument("--stage", default="final")
    p.add_argument("--no-render", dest="render", action="store_false")
    p.add_argument("--write-card", action="store_true")
    args = p.parse_args()

    records = []
    for name in args.domains:
        print(f"[v3] {name}: building...", flush=True)
        records += generate_domain(DOMAINS[name], args)

    print(f"[v3] validating {len(records)} documents...", flush=True)
    validation = validate(records)
    qa_rng = random.Random(args.seed)
    qa = [q for r in records if r["split"] in ("train", "dev", "test", "adversarial", "control")
          for q in build_questions(r, DOMAINS[r["domain"]].QUESTION_LABELS, qa_rng)]
    split_of = {r["doc_id"]: r["split"] for r in records}
    for q in qa:
        q["split"] = split_of[q["doc_id"]]

    report = quality_report(records, qa, validation, args)
    reports = REPO / "research" / "data" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    suffix = "" if args.stage == "final" else f"_{args.stage}"
    (reports / f"dataset_quality{suffix}.json").write_text(json.dumps(report, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps({k: report[k] for k in ("total_documents", "critical_failures", "invalid_annotation_count",
                                             "duplicate_rate", "near_duplicate_pairs", "train_test_leakage_count",
                                             "template_leakage_count", "qa_benchmark")}, indent=1))
    if validation["critical"]:
        for line in validation["critical"][:40]:
            print("  CRITICAL", line)
        sys.exit(f"[ABORT] {len(validation['critical'])} critical validation failures - fix the generator")

    args.out.mkdir(parents=True, exist_ok=True)
    write_outputs(records, qa, args)
    if args.write_card:
        from v3.report import write_dataset_card
        write_dataset_card(report, REPO / "docs" / "dataset_card.md")
    print(f"[v3] done -> {args.out}")


if __name__ == "__main__":
    main()
