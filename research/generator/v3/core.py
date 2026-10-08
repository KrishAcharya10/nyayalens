"""
NyayaLens synthetic generator v3 - core document builder.

Extends v2's discipline (every labeled value appended with exact offsets,
nothing found by post-hoc matching) from entities + clauses to all eleven
annotation layers the Phase 8 dataset needs:

  raw text, entities (+ core types), semantic roles, relations, clauses,
  obligations, temporal facts, financial facts, semantic facts, risks,
  consistency expectations  (+ the QA benchmark, built from these in qa.py)

Every annotation is recorded at the moment its text is written, so offsets
and values are correct by construction. `finish()` resolves keys to
mention ids and fails loudly on anything inconsistent (an unknown label,
a relation to a value that was never written, an obligation whose actor
is not a party, ...).

Determinism: callers seed `value_pools_v2` (vp.seed_all) per document, so
one (domain, set, index) -> one document, and an adversarial document and
its control, or the two halves of a counterfactual pair, share a seed and
differ only where intended.
"""

import calendar
import hashlib
import json
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import value_pools_v2 as vp
from value_pools_v2 import rng

GENERATOR_VERSION = "3.0"

ONTOLOGY_PATH = Path(__file__).resolve().parent / "ontology.json"
ONTOLOGY = {d["id"]: d for d in json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))["domains"]}

HEADING_STYLES = ["numbered_caps", "numbered_title", "clause_word", "paren", "article_roman", "inline"]

# How hard a document is to read, not how risky it is.
DIFFICULTY = {
    "EASY": dict(styles=["numbered_caps"], optional=0.7, alt_terms=0.0, cross_refs=0.0, wrap=0.0,
                 restate=0.1, annex=0.1, long=0.0),
    "MEDIUM": dict(styles=["numbered_caps", "numbered_title", "clause_word", "paren"], optional=1.0,
                   alt_terms=0.35, cross_refs=0.35, wrap=0.0, restate=0.3, annex=0.35, long=0.3),
    "HARD": dict(styles=HEADING_STYLES, optional=1.25, alt_terms=0.75, cross_refs=0.75, wrap=0.035,
                 restate=0.5, annex=0.6, long=0.7),
}

DURATION_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}

# Sets whose documents never see held-out template variants.
SEEN_TEMPLATE_SETS = {"train", "dev"}


class GenerationError(RuntimeError):
    pass


# --- values -----------------------------------------------------------------

@dataclass
class Ent:
    """A labeled value. `key` names the fact (all mentions of the sale
    consideration share key "consideration"); `norm` is its normalized
    value; `suffix` is written after the span but outside it."""

    text: str
    label: str
    key: str | None = None
    norm: dict | None = None
    suffix: str = ""


def money(n: int, label: str, key: str, style=None, words: bool | None = None) -> Ent:
    style = style or vp.pick_currency_style()
    span, suffix = vp.format_amount(n, style)
    if words is False:
        suffix = style[1]
    return Ent(span, label, key, {"amount": n, "currency": "INR"}, suffix)


def duration(n: int, unit: str, label: str, key: str, plain: bool = False) -> Ent:
    text = f"{n} {unit if n == 1 else unit + 's'}" if plain else vp.format_count(n, unit)
    return Ent(text, label, key, {"value": n, "unit": unit, "days": n * DURATION_DAYS[unit]})


def date_ent(d: date, label: str, key: str, style: int) -> Ent:
    return Ent(vp.format_date(d.day, d.month, d.year, style), label, key, {"iso": d.isoformat()})


def percent(value: float, label: str, key: str, text: str | None = None) -> Ent:
    shown = text or (f"{value:g}%")
    return Ent(shown, label, key, {"value": value})


def area(value: float, unit: str, label: str, key: str) -> Ent:
    shown = f"{value:,}" if isinstance(value, int) and value >= 1000 else f"{value:g}"
    return Ent(f"{shown} {unit}", label, key, {"value": value, "unit": unit})


def ident(text: str, label: str, key: str) -> Ent:
    return Ent(text, label, key, {"value": re.sub(r"\s+", "", text).upper()})


def textual(text: str, label: str, key: str) -> Ent:
    return Ent(text, label, key, {"value": re.sub(r"\s+", " ", text).strip().lower()})


def party(name: str, label: str, key: str) -> Ent:
    return Ent(name, label, key, {"value": name})


def add_months(start: date, months: int) -> date:
    total = start.year * 12 + start.month - 1 + months
    year, month = total // 12, total % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1])) - timedelta(days=1)


_ROMAN = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def roman(n: int) -> str:
    out = ""
    for value, sym in _ROMAN:
        while n >= value:
            out += sym
            n -= value
    return out


def title_case(heading: str) -> str:
    small = {"and", "of", "on", "the", "for", "to", "in", "by"}
    words = heading.lower().split(" ")
    return " ".join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))


_PLACEHOLDER = re.compile(r"\{(\w+)\}")


# --- builder ----------------------------------------------------------------

class DocBuilder:
    def __init__(self, *, doc_id: str, domain: str, document_type: str, split: str, difficulty: str,
                 seed: int, inject: str | None = None, inject_active: bool = False,
                 overrides: dict | None = None, generic_title: bool = False):
        if domain not in ONTOLOGY:
            raise GenerationError(f"unknown domain {domain}")
        self.ontology = ONTOLOGY[domain]
        self.core_type = {e["label"]: e["coreType"] for e in self.ontology["entities"]}
        self.doc_id, self.domain, self.document_type = doc_id, domain, document_type
        self.split, self.difficulty, self.seed = split, difficulty, seed
        self.profile = DIFFICULTY[difficulty]
        self.heading_style = rng.choice(self.profile["styles"])
        self.inject, self.inject_active = inject, inject_active
        self.overrides = overrides or {}
        self.generic_title = generic_title
        self.date_style = rng.randrange(vp.DATE_STYLES)
        self.currency = vp.pick_currency_style()
        self.text = ""
        self.entities: list[dict] = []
        self.clauses: list[dict] = []
        self._relations: list[dict] = []
        self._obligations: list[dict] = []
        self.risks: list[dict] = []
        self._expectations: list[dict] = []
        self.templates: list[str] = []
        self.heldout: list[str] = []
        self.values: dict = {}
        self.metadata: dict = {}
        self.next_no = 1
        self._clause: dict | None = None

    # -- randomness helpers --------------------------------------------------
    def chance(self, p: float) -> bool:
        return rng.random() < min(1.0, p)

    def optional(self, p: float) -> bool:
        """An optional clause, scaled by difficulty (harder = more clauses)."""
        return self.chance(p * self.profile["optional"])

    def val(self, name: str, draw):
        """Draw a value, then apply a counterfactual override. The draw
        always happens, so overriding never shifts later random choices."""
        value = draw()
        if name in self.overrides:
            value = self.overrides[name]
        self.values[name] = value
        return value

    def pick(self, key: str, variants: list):
        n = len(variants)
        n_held = max(1, n // 4) if n >= 3 else 0
        if self.split in SEEN_TEMPLATE_SETS or not n_held:
            idx = rng.randrange(n - n_held)
        elif self.split == "test":
            idx = rng.randrange(n - n_held, n) if rng.random() < 0.5 else rng.randrange(n - n_held)
        else:  # evaluation-only sets (adversarial/control/counterfactual/cross-domain) draw freely
            idx = rng.randrange(n)
        tag = f"{key}#{idx}"
        self.templates.append(tag)
        if idx >= n - n_held:
            self.heldout.append(tag)
        return variants[idx]

    def term(self, primary: str, alternatives: list[str]) -> str:
        """The word a document uses for a party role (alternative
        terminology is a HARD-document feature)."""
        if alternatives and self.chance(self.profile["alt_terms"]):
            return rng.choice(alternatives)
        return primary

    # -- text emission -------------------------------------------------------
    def t(self, text: str) -> None:
        wrap = self.profile["wrap"]
        if wrap and len(text) > 60:
            chars = list(text)
            for i, c in enumerate(chars):
                if c == " " and rng.random() < wrap:
                    chars[i] = "\n"
            text = "".join(chars)
        self.text += text

    def e(self, ent: Ent) -> str:
        if ent.label not in self.core_type:
            raise GenerationError(f"{self.domain}: label {ent.label} is not in the ontology")
        start = len(self.text)
        self.text += ent.text
        mention_id = f"m{len(self.entities)}"
        self.entities.append({
            "id": mention_id, "label": ent.label, "core_type": self.core_type[ent.label],
            "text": ent.text, "start": start, "end": len(self.text), "key": ent.key,
            "normalized": ent.norm, "clause_id": self._clause["id"] if self._clause else None,
        })
        if ent.suffix:
            self.t(ent.suffix)
        return mention_id

    def emit(self, template: str, **values) -> tuple[int, int]:
        start = len(self.text)
        pos = 0
        for m in _PLACEHOLDER.finditer(template):
            self.t(template[pos:m.start()])
            value = values[m.group(1)]
            if isinstance(value, Ent):
                self.e(value)
            else:
                self.t(str(value))
            pos = m.end()
        self.t(template[pos:])
        return start, len(self.text)

    # -- structure -------------------------------------------------------------
    def _heading(self, n: int, heading: str) -> None:
        style = self.heading_style
        if style == "numbered_caps":
            self.text += f"{n}. {heading.upper()}\n"
        elif style == "numbered_title":
            self.text += f"{n}. {title_case(heading)}\n"
        elif style == "clause_word":
            self.text += f"Clause {n}: {title_case(heading)}\n"
        elif style == "paren":
            self.text += f"{n}) {heading.upper()}\n"
        elif style == "article_roman":
            self.text += f"ARTICLE {roman(n)} - {heading.upper()}\n"
        else:  # inline
            self.text += f"{n}. {title_case(heading)}: "

    @contextmanager
    def clause(self, clause_type: str, key: str, headings: list[str]):
        if clause_type not in self.ontology["clauseTypes"]:
            raise GenerationError(f"{self.domain}: clause type {clause_type} is not in the ontology")
        heading = self.pick(f"{key}.h", headings)
        start = len(self.text)
        n = self.next_no
        self._heading(n, heading)
        cid = f"c{len(self.clauses)}"
        self._clause = {"id": cid, "label": clause_type, "number": str(n), "heading": heading, "start": start}
        yield
        if not self.text.endswith("\n"):
            self.text += "\n"
        self.text += "\n"
        self._clause["end"] = len(self.text)
        self.clauses.append(self._clause)
        self._clause = None
        self.next_no += 1

    @contextmanager
    def section(self, clause_type: str, title: str):
        """An unnumbered section (schedule, annexure) recorded as a clause."""
        start = len(self.text)
        self.text += f"{title}\n"
        cid = f"c{len(self.clauses)}"
        self._clause = {"id": cid, "label": clause_type, "number": None, "heading": title, "start": start}
        yield
        if not self.text.endswith("\n"):
            self.text += "\n"
        self._clause["end"] = len(self.text)
        self.clauses.append(self._clause)
        self._clause = None

    def clause_number(self, clause_type: str) -> str | None:
        for c in self.clauses:
            if c["label"] == clause_type and c["number"]:
                return c["number"]
        return None

    def cross_ref(self, clause_type: str, fmt: str = " (as set out in Clause {n} above)") -> str:
        n = self.clause_number(clause_type)
        if n and self.chance(self.profile["cross_refs"]):
            return fmt.format(n=n)
        return ""

    # -- semantic annotations ------------------------------------------------
    def relation(self, relation_type: str, subject: str, obj: str) -> None:
        """subject/obj are fact keys; subject may be "DOCUMENT". Recording the
        same relation twice (e.g. identifiers restated in a schedule) is a no-op."""
        rel = {"type": relation_type, "subject": subject, "object": obj}
        if rel not in self._relations:
            self._relations.append(rel)

    def ob(self, template: str, *, actor: str, action: str, amount: str | None = None,
           deadline: str | None = None, obj: str | None = None, purpose: str | None = None,
           frequency: str | None = None, condition: str | None = None, role_reversal: bool = False,
           **values) -> tuple[int, int]:
        """Emit one obligation sentence and record it with its exact span.
        `role_reversal` marks a deliberately wrong actor (adversarial
        PARTY_ROLE_INCONSISTENCY documents) so finish() accepts it."""
        span = self.emit(template, **values)
        self._obligations.append({
            "actor": actor, "action": action, "amount": amount, "deadline": deadline,
            "object": obj, "purpose": purpose, "frequency": frequency, "condition": condition,
            "role_reversal": role_reversal, "start": span[0], "end": span[1], "clause_id": self._clause["id"] if self._clause else None,
        })
        return span

    def risk(self, category: str, rule: str, **detail) -> None:
        self.risks.append({
            "category": category, "rule": rule, "review_required": True,
            "clause_id": self._clause["id"] if self._clause else None, "detail": detail,
        })

    def expect(self, category: str, rule_id: str, keys: list[str], **detail) -> None:
        """Consistency ground truth for an adversarial document (FLAG) or
        its matched control (NO_FLAG)."""
        self._expectations.append({
            "category": category, "rule_id": rule_id, "keys": keys,
            "expected_result": "FLAG" if self.inject_active else "NO_FLAG", "detail": detail,
        })

    # -- finish ----------------------------------------------------------------
    def _mentions(self, key: str) -> list[dict]:
        return [m for m in self.entities if m["key"] == key]

    def _span(self, start: int, end: int) -> dict:
        return {"start": start, "end": end, "text": self.text[start:end]}

    def finish(self, metadata: dict) -> dict:
        onto = self.ontology
        rel_types = {(r["type"], r["subject"], r["object"]) for r in onto["relations"]}
        obligation_actors = {o["action"]: set(o["actors"]) for o in onto["obligations"]}
        rules = {r["id"]: r for r in onto["consistencyRules"]}
        by_key: dict[str, list[dict]] = {}
        for m in self.entities:
            if m["key"]:
                by_key.setdefault(m["key"], []).append(m)

        def label_of(key: str) -> str:
            if key == "DOCUMENT":
                return "DOCUMENT"
            if key not in by_key:
                raise GenerationError(f"{self.doc_id}: annotation refers to key '{key}' that was never written")
            return by_key[key][0]["label"]

        relations = []
        for r in self._relations:
            s_label, o_label = label_of(r["subject"]), label_of(r["object"])
            if (r["type"], s_label, o_label) not in rel_types:
                raise GenerationError(f"{self.doc_id}: relation {r['type']}({s_label},{o_label}) not in ontology")
            obj = by_key[r["object"]]
            relations.append({
                "id": f"r{len(relations)}", "type": r["type"],
                "subject_label": s_label, "subject_key": r["subject"],
                "subject_mention": None if r["subject"] == "DOCUMENT" else by_key[r["subject"]][0]["id"],
                "object_label": o_label, "object_key": r["object"],
                "object_mentions": [m["id"] for m in obj], "clause_id": obj[0]["clause_id"],
            })

        obligations = []
        for o in self._obligations:
            actor_label = label_of(o["actor"])
            if o["action"] not in obligation_actors or (
                    actor_label not in obligation_actors[o["action"]] and not o["role_reversal"]):
                raise GenerationError(f"{self.doc_id}: obligation {actor_label} {o['action']} not in ontology")
            def in_sentence(key: str, o=o) -> dict:
                # The mention written inside this obligation's own sentence -
                # the amount may also be stated elsewhere, but the evidence
                # for this obligation is the sentence.
                found = [m for m in by_key.get(key, []) if o["start"] <= m["start"] < o["end"]]
                if not found:
                    raise GenerationError(f"{self.doc_id}: obligation value '{key}' is not inside its sentence")
                return found[0]

            amount = in_sentence(o["amount"]) if o["amount"] else None
            deadline = in_sentence(o["deadline"]) if o["deadline"] else None
            obligations.append({
                "id": f"o{len(obligations)}", "actor_label": actor_label, "actor_key": o["actor"],
                "actor_mention": by_key[o["actor"]][0]["id"], "action": o["action"],
                "object": o["object"], "purpose": o["purpose"],
                "amount_mention": amount["id"] if amount else None,
                "amount_label": amount["label"] if amount else None,
                "amount": amount["normalized"] if amount else None,
                "deadline_mention": deadline["id"] if deadline else None,
                "deadline": deadline["normalized"] if deadline else None,
                "frequency": o["frequency"], "condition": o["condition"], "role_reversal": o["role_reversal"],
                "clause_id": o["clause_id"], "evidence": self._span(o["start"], o["end"]),
            })

        temporal = [{"type": m["label"], "mention": m["id"], "text": m["text"], "normalized": m["normalized"]}
                    for m in self.entities if m["core_type"] in ("DATE", "DURATION")]
        financial = [{"type": m["label"], "mention": m["id"], "text": m["text"], **(m["normalized"] or {})}
                     for m in self.entities if m["core_type"] == "MONEY"]

        facts = []
        for r in relations:
            seen = set()
            for mid in r["object_mentions"]:
                m = next(x for x in self.entities if x["id"] == mid)
                sig = json.dumps(m["normalized"], sort_keys=True)
                if sig in seen:
                    continue
                seen.add(sig)
                subj = None if r["subject_mention"] is None else next(
                    x for x in self.entities if x["id"] == r["subject_mention"])
                facts.append({
                    "id": f"f{len(facts)}", "source": "relation", "subject": r["subject_label"],
                    "subject_text": subj["text"] if subj else None, "predicate": r["type"],
                    "object": r["object_label"], "object_text": m["text"], "qualifiers": {},
                    "normalized_value": m["normalized"], "clause_id": m["clause_id"],
                    "evidence": self._span(m["start"], m["end"]),
                })
        for o in obligations:
            facts.append({
                "id": f"f{len(facts)}", "source": "obligation", "subject": o["actor_label"],
                "subject_text": next(x for x in self.entities if x["id"] == o["actor_mention"])["text"],
                "predicate": f"MUST_{o['action']}", "object": o["amount_label"] or o["object"],
                "object_text": None, "qualifiers": {k: o[k] for k in ("purpose", "frequency", "condition")
                                                    if o[k]} | ({"deadline": o["deadline"]} if o["deadline"] else {}),
                "normalized_value": o["amount"], "clause_id": o["clause_id"], "evidence": o["evidence"],
            })

        expectations = []
        for x in self._expectations:
            rule = rules.get(x["rule_id"])
            if not rule or rule["category"] != x["category"]:
                raise GenerationError(f"{self.doc_id}: expectation {x['rule_id']}/{x['category']} not in ontology")
            mentions = [m for k in x["keys"] for m in self._mentions(k)]
            if not mentions:
                raise GenerationError(f"{self.doc_id}: expectation {x['rule_id']} has no evidence")
            expectations.append({
                "category": x["category"], "rule_id": x["rule_id"], "expected_result": x["expected_result"],
                "expected_evidence": [{"mention": m["id"], **self._span(m["start"], m["end"])} for m in mentions],
                "detail": x["detail"],
            })

        # MISSING_CLAUSE ground truth is derived, not hand-labeled: every
        # clause type the pack expects for this document type that the
        # document does not contain. (Hand-recorded MISSING_CLAUSE risks are
        # replaced, so an optional clause that happened to be skipped can
        # never be left unlabeled.)
        present = {c["label"] for c in self.clauses}
        expected = self.ontology["expectedByDocumentType"].get(self.document_type, [])
        self.risks = [r for r in self.risks if r["category"] != "MISSING_CLAUSE"] + [
            {"category": "MISSING_CLAUSE", "rule": "missing_clause", "review_required": True, "clause_id": None,
             "detail": {"clause_type": ct}} for ct in expected if ct not in present]

        template_id = hashlib.sha1("|".join(sorted(self.templates)).encode()).hexdigest()[:12]
        return {
            "doc_id": self.doc_id, "domain": self.domain, "document_type": self.document_type,
            "template_id": template_id, "generator_version": GENERATOR_VERSION, "random_seed": self.seed,
            "difficulty": self.difficulty, "split": self.split, "heading_style": self.heading_style,
            "raw_text": self.text, "clauses": self.clauses, "entities": self.entities,
            "relations": relations, "obligations": obligations, "temporal_facts": temporal,
            "financial_facts": financial, "semantic_facts": facts, "risks": self.risks,
            "consistency_expectations": expectations, "templates": self.templates,
            "heldout_templates": self.heldout, "values": {k: _jsonable(v) for k, v in self.values.items()},
            "metadata": {"currency_style": self.currency[0], **metadata},
        }


def _jsonable(v):
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    return v
