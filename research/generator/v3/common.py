"""Building blocks shared by every v3 domain module."""

from datetime import date, timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from .core import DocBuilder, Ent, date_ent, party

GENERIC_TITLES = ["AGREEMENT", "THIS AGREEMENT", "MEMORANDUM OF AGREEMENT", "DEED"]


def title(b: DocBuilder, key: str, titles: list[str]) -> str:
    """The document title. Cross-domain test documents get a generic title
    so domain detection has to rely on content, not the heading."""
    if b.generic_title:
        chosen = rng.choice(GENERIC_TITLES)
    else:
        chosen = b.pick(f"{key}.title", titles)
    b.t(chosen + "\n\n")
    return chosen


def stamp_paper_line(b: DocBuilder) -> None:
    if b.chance(0.35):
        b.t(f"(On Non-Judicial Stamp Paper of Rs. {rng.choice([100, 200, 500])}/-)\n\n")


def execution_line(b: DocBuilder, key: str, loc: dict, when: date, date_label: str, deed_word: str) -> None:
    b.emit(b.pick(f"{key}.exec", [
        "This {deed} is made and executed at {city} on this {when}, between:\n\n",
        "This {deed} is executed at {city} on {when} BY AND BETWEEN:\n\n",
        "THIS {DEED} is made at {city} on the {when} between:\n\n",
        "Executed at {city} on {when}, this {deed} is entered into by and between:\n\n",
    ]), deed=deed_word, DEED=deed_word.upper(), city=Ent(loc["city"], "ADDRESS", "place"),
        when=date_ent(when, date_label, "instrument_date", b.date_style))


def random_dates(b: DocBuilder):
    d, m, y = vp.random_date()
    return date(y, m, d)


def _successors(p: dict) -> str:
    if p["is_company"]:
        return "its successors and permitted assigns"
    return f"{p['pronoun']} heirs, executors, administrators and assigns"


def party_block(b: DocBuilder, label: str, key: str, term: str, p: dict, fmt: str, side: str) -> None:
    """One party. `label` is the ontology role (SELLER), `term` the word
    this document uses for it (Vendor), `key` the fact key."""
    if fmt == "short":
        b.t(f"{term.upper()}: ")
        b.e(party(p["name"], label, key))
        b.t(f", hereinafter referred to as the '{term}'")
        return
    if p["is_company"]:
        sig = p["signatory"]
        office = business_address(vp.random_location())
        kind = ("a limited liability partnership registered under the LLP Act, 2008" if "LLP" in p["name"]
                else "a company incorporated under the Companies Act, 2013")
        b.t("M/s. ")
        b.e(party(p["name"], label, key))
        b.t(f", {kind}, having its registered office at {office}, acting through its authorised "
            f"signatory {sig['honorific']} {sig['name']}, ")
    else:
        residence = vp.random_property_address(vp.random_location())
        b.t(f"{p['honorific']} ")
        b.e(party(p["name"], label, key))
        b.t(f", aged about {p['age']} years, {p['relation']} {p['parent']}, residing at {residence}, ")
    b.t(f'hereinafter referred to as the "{term.upper()}" (which expression shall, unless repugnant to the '
        f"context or meaning thereof, mean and include {_successors(p)}) of the {side} PART")


def parties(b: DocBuilder, first: tuple, second: tuple) -> None:
    """first/second: (label, key, term, party_dict)."""
    fmt = "short" if b.chance(0.3 if b.difficulty != "HARD" else 0.1) else "long"
    party_block(b, *first, fmt, "ONE")
    b.t(",\n\nAND\n\n" if fmt == "short" else ";\n\nAND\n\n")
    party_block(b, *second, fmt, "OTHER")
    b.t(".\n\n")


def joint_party_block(b: DocBuilder, label: str, keys: list[str], term: str, people: list[dict], side: str) -> None:
    """Two or more natural persons acting jointly (co-purchasers)."""
    for i, (k, p) in enumerate(zip(keys, people), 1):
        b.t(f"({i}) {p['honorific']} ")
        b.e(party(p["name"], label, k))
        b.t(f", aged about {p['age']} years, {p['relation']} {p['parent']}")
        b.t(" and\n" if i < len(people) else ", ")
    b.t(f'both residing at {vp.random_property_address(vp.random_location())}, hereinafter jointly referred to '
        f'as the "{term.upper()}S" (which expression shall include their respective heirs, executors and '
        f"assigns) of the {side} PART")


def signatures(b: DocBuilder, signers: list[tuple], deed_word: str, witness_prob: float = 0.85) -> None:
    """signers: (heading, label, key, name)."""
    b.t(f"IN WITNESS WHEREOF, the parties hereto have signed this {deed_word} on the day, month and year "
        "first above written.\n\n")
    for heading, label, key, name in signers:
        b.t(f"{heading}\n(")
        b.e(party(name, label, key))
        b.t(")\n\n")
    if "WITNESS" in b.core_type and b.chance(witness_prob):
        b.t("WITNESSES:\n")
        for i in (1, 2):
            b.t(f"{i}. ")
            b.e(Ent(vp.random_person()["name"], "WITNESS", f"witness_{i}", {"value": None}))
            b.t(f", {vp.random_location()['city']}\n")


def dispute_clause(b: DocBuilder, key: str, loc: dict, deed_word: str) -> None:
    with b.clause("DISPUTE_RESOLUTION", f"{key}.dispute", ["DISPUTE RESOLUTION", "SETTLEMENT OF DISPUTES", "ARBITRATION"]):
        b.emit(b.pick(f"{key}.dispute.b", [
            "Any dispute arising out of this {deed} shall be referred to arbitration under the Arbitration and Conciliation Act, 1996.",
            "All disputes shall first be attempted to be resolved amicably, failing which the matter shall be referred to a sole arbitrator, and the seat of arbitration shall be {city}.",
            "The parties shall attempt to settle any dispute through mutual discussion within thirty days, failing which either party may approach the competent court.",
        ]), deed=deed_word, city=loc["city"])


def jurisdiction_clause(b: DocBuilder, key: str, loc: dict, deed_word: str) -> None:
    with b.clause("JURISDICTION", f"{key}.juris", ["JURISDICTION", "GOVERNING LAW AND JURISDICTION", "GOVERNING LAW"]):
        b.emit(b.pick(f"{key}.juris.b", [
            "This {deed} shall be governed by the laws of India, and the courts at {city} alone shall have jurisdiction.",
            "The courts at {city} shall have exclusive jurisdiction over any matter arising from this {deed}.",
            "This {deed} shall be governed by the laws of India and the laws of {state}, and shall be subject to the jurisdiction of the competent courts at {city}, with appeals lying before the {hc}.",
        ]), deed=deed_word, city=Ent(loc["city"], "JURISDICTION", "jurisdiction", {"value": loc["city"]}),
            state=loc["state"], hc=loc["high_court"])
    b.relation("HAS_JURISDICTION", "DOCUMENT", "jurisdiction")


def later_date(start: date, min_days: int, max_days: int) -> date:
    return start + timedelta(days=rng.randint(min_days, max_days))


def person_or_company(company_prob: float) -> dict:
    return vp.random_company() if rng.random() < company_prob else vp.random_person()


def shuffled(items: list) -> list:
    items = list(items)
    rng.shuffle(items)
    return items


def business_address(loc: dict) -> str:
    """A commercial address (companies don't have registered offices in flats)."""
    return (f"{rng.choice(['Unit', 'Office', 'Suite'])} No. {rng.randint(101, 1250)}, "
            f"{rng.choice(vp.VILLAGE_ROOTS)} {rng.choice(['Business Park', 'Trade Centre', 'Corporate Tower', 'Tech Park'])}, "
            f"{loc['locality']}, {loc['city']} - {loc['pin']}")
