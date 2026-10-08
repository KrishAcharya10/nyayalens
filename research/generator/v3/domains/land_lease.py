"""land_lease: v2's land-lease generator ported to the v3 layers."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import (dispute_clause, execution_line, jurisdiction_clause, parties, person_or_company,
                      random_dates, signatures, title)
from ..core import DocBuilder, add_months, area, date_ent, duration, ident, money, percent, textual

DOMAIN = "land_lease"
DOCUMENT_TYPES = [("LAND_LEASE", 1.0)]
REQUIRED_LABELS = ["LESSOR", "LESSEE", "SURVEY_NUMBER", "LAND_AREA", "RENT", "DURATION"]

ADVERSARIAL = {
    "SURVEY_NUMBER_CONTRADICTION": "PROPERTY_IDENTIFIER_CONTRADICTION",
    "LAND_AREA_CONTRADICTION": "PROPERTY_AREA_CONTRADICTION",
    "RENT_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "RENT_PAYER_REVERSAL": "PARTY_ROLE_INCONSISTENCY",
}
REQUIRES: dict = {}
COUNTERFACTUALS = {
    "annual_rent": lambda v: v + rng.choice([10_000, 25_000, 50_000]),
    "years": lambda v: {3: 5, 5: 10, 10: 15, 11: 20, 15: 30, 20: 30, 30: 20}[v],
}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"annual_rent": {"RENT"}, "years": {"DURATION", "EXPIRY_DATE"}}
QUESTION_LABELS = ["LESSOR", "LESSEE", "SURVEY_NUMBER", "LAND_AREA", "LAND_USE_TYPE", "LAND_USE_RESTRICTION", "RENT",
                   "LEASE_PREMIUM", "DURATION", "COMMENCEMENT_DATE", "KHATA_NUMBER", "JURISDICTION"]

AGRI_TYPES = ["Agricultural", "Garden Land", "Dry Land", "Wet Land"]
NON_AGRI_TYPES = ["Non-Agricultural (NA)", "Commercial", "Industrial (NA)"]
AGRI_USES = ["cultivation of seasonal crops", "horticultural plantation", "dairy farming operations", "organic vegetable farming"]
NON_AGRI_USES = ["construction of a warehouse facility", "commercial retail development", "industrial processing operations"]


def build(b: DocBuilder) -> dict:
    loc = vp.random_location()
    info = loc["info"]
    lessor = person_or_company(0.1)
    lessee = person_or_company(0.3)
    executed = random_dates(b)
    start = executed + timedelta(days=rng.choice([0, 15, 30]))
    years = b.val("years", lambda: rng.choice([3, 5, 10, 11, 15, 20, 30]))
    annual_rent = b.val("annual_rent", lambda: rng.randrange(20_000, 600_000, 1_000))
    premium = rng.randrange(100_000, 5_000_000, 10_000)
    prefix, kind = rng.choice(info["survey_formats"])
    survey = vp.random_survey_number(kind)
    khata = str(rng.randint(10, 4999)) if info["khata"] and rng.random() < 0.7 else None
    unit = rng.choice(info["area_units"])
    area_value = round(rng.uniform(0.5, 12), 2) if unit in ("acres", "hectares") else rng.randint(5, 40)
    is_agri = rng.random() < 0.7
    land_type = rng.choice(AGRI_TYPES if is_agri else NON_AGRI_TYPES)
    use = rng.choice(AGRI_USES if is_agri else NON_AGRI_USES)

    alt_survey = vp.random_survey_number(kind)
    alt_area = round(area_value + 0.75, 2) if isinstance(area_value, float) else area_value + rng.choice([2, 5])
    alt_rent = annual_rent + rng.choice([5_000, 10_000, 25_000])
    contradiction_use = rng.choice(NON_AGRI_USES)
    unfair_use = is_agri and b.chance(0.15) and not b.inject
    if unfair_use:
        use = contradiction_use
    missing = rng.choice(["LEASE_PREMIUM", "DISPUTE_RESOLUTION", None, None, None, None, None]) if not b.inject else None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    title(b, "land", ["LAND LEASE DEED", "DEED OF LEASE", "LEASE DEED", "INDENTURE OF LEASE"])
    execution_line(b, "land", loc, executed, "EXECUTION_DATE", "Deed")
    parties(b, ("LESSOR", "lessor", "Lessor", lessor), ("LESSEE", "lessee", "Lessee", lessee))
    b.t(f"WHEREAS the Lessor is the absolute owner of the land bearing {prefix} ")
    b.e(ident(survey, "SURVEY_NUMBER", "survey"))
    if khata:
        b.t(", Khata No. ")
        b.e(ident(khata, "KHATA_NUMBER", "khata"))
    b.emit(", admeasuring {a}, situated at Village {v}, District {d}, classified as {lt} land, and has agreed to lease the same to the Lessee;\n\nNOW THIS DEED WITNESSETH AS FOLLOWS:\n\n",
           a=area(area_value, unit, "LAND_AREA", "area"), v=loc["village"], d=loc["district"],
           lt=textual(land_type, "LAND_USE_TYPE", "land_type"))
    for rel in [("LEASES_TO", "lessor", "lessee"), ("OWNS", "lessor", "survey"), ("HAS_AREA", "survey", "area"),
                ("CLASSIFIED_AS", "survey", "land_type")]:
        b.relation(*rel)

    with b.clause("LEASE_DURATION", "land.dur", ["LEASE DURATION", "DURATION OF LEASE", "TERM OF LEASE"]):
        b.emit("This lease is granted for a term of {dur} commencing on {s} and expiring on {e}.",
               dur=duration(years, "year", "DURATION", "duration"), s=date_ent(start, "COMMENCEMENT_DATE", "start", b.date_style),
               e=date_ent(add_months(start, years * 12), "EXPIRY_DATE", "end", b.date_style))
        for rel in [("HAS_TERM", "DOCUMENT", "duration"), ("STARTS_ON", "DOCUMENT", "start"), ("ENDS_ON", "DOCUMENT", "end")]:
            b.relation(*rel)

    if missing != "LEASE_PREMIUM":
        with b.clause("LEASE_PREMIUM", "land.prem", ["LEASE PREMIUM", "PREMIUM", "ONE-TIME PREMIUM"]):
            b.ob("The Lessee shall pay a one-time lease premium of {p} to the Lessor upon execution of this Deed.",
                 actor="lessee", action="PAY", amount="premium", purpose="LEASE_PREMIUM", p=money(premium, "LEASE_PREMIUM", "premium", b.currency))
            b.relation("MUST_PAY", "lessee", "premium")
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="LEASE_PREMIUM")

    with b.clause("RENT_PAYMENT", "land.rent", ["ANNUAL LEASE RENT", "LEASE RENT", "RENT"]):
        reversal = active("RENT_PAYER_REVERSAL")
        payer, payee = ("Lessor", "Lessee") if reversal else ("Lessee", "Lessor")
        b.ob(b.pick("land.rent.b", [
            "The {payer} shall pay the {payee} an annual lease rent of {r} on or before {m} each year.",
            "An annual rent of {r} shall be paid by the {payer} to the {payee} on or before {m} of every calendar year.",
            "The {payer} shall pay a yearly rent of {r} to the {payee}, by the end of {m} every year.",
        ]), actor="lessor" if reversal else "lessee", action="PAY", amount="rent", purpose="RENT", frequency="ANNUAL",
            role_reversal=reversal, payer=payer, payee=payee, r=money(annual_rent, "RENT", "rent", b.currency), m=rng.choice(vp.MONTHS))
        if not reversal:
            b.relation("MUST_PAY", "lessee", "rent")
    if involved("RENT_PAYER_REVERSAL"):
        b.expect("PARTY_ROLE_INCONSISTENCY", "land_rent_payer", ["rent"])

    with b.clause("LAND_USE_RESTRICTION", "land.use", ["PERMITTED USE", "LAND USE", "USE OF LAND", "PURPOSE OF LEASE"]):
        b.ob("The Lessee shall use the leased land solely for {u} and for no other purpose.", actor="lessee", action="USE_ONLY_FOR",
             u=textual(use, "LAND_USE_RESTRICTION", "use"))
        b.relation("PERMITTED_USE", "DOCUMENT", "use")
        if unfair_use:
            b.risk("LAND_USE_CONTRADICTION", "land_use_type_vs_permitted_use", land_use_type=land_type, permitted_use=use)

    for prob, ctype, key, headings, body, ob in [
        (0.5, "RENT_ESCALATION", "land.esc", ["RENT ESCALATION", "ENHANCEMENT OF RENT"], None, None),
        (0.5 if is_agri else 0.0, "CROP_OR_CULTIVATION_RIGHTS", "land.crop", ["CROP RIGHTS", "CULTIVATION RIGHTS"], "The Lessee shall be entitled to all crops raised on the land during the term.", None),
        (0.35, "WATER_RIGHTS", "land.water", ["WATER RIGHTS", "IRRIGATION"], "The Lessee may draw water from the existing borewell for irrigation.", None),
        (0.5, "REVENUE_AND_TAXES", "land.tax", ["LAND REVENUE AND TAXES", "RATES AND TAXES"], "During the term, the Lessee shall pay all land revenue, cesses and taxes levied on the land.", ("lessee", "PAY_TAXES")),
        (0.3, "SUB_LEASE", "land.sublease", ["SUB-LEASE", "ASSIGNMENT AND SUB-LEASE"], "The Lessee shall not sub-lease the land without the Lessor's written consent.", None),
        (0.3, "RENEWAL", "land.renew", ["RENEWAL", "OPTION TO RENEW"], "The lease may be renewed on mutually agreed terms.", None),
    ]:
        if not b.optional(prob):
            continue
        with b.clause(ctype, key, headings):
            if ctype == "RENT_ESCALATION":
                b.emit("The annual rent shall be enhanced by {r} every three years.", r=percent(rng.choice([5, 10, 15]), "ESCALATION_RATE", "escalation"))
            elif ob:
                b.ob(body, actor=ob[0], action=ob[1])
            else:
                b.t(body)

    if b.optional(0.3):
        with b.clause("EASEMENT", "land.ease", ["EASEMENT", "RIGHT OF WAY"]):
            b.emit("The Lessee shall have a {e} over the cart track passing through the adjoining land for access to the leased land.",
                   e=textual("right of way", "EASEMENT_RIGHT", "easement"))
    if b.optional(0.35):
        with b.clause("IMPROVEMENTS_AND_STRUCTURES", "land.improve", ["STRUCTURES AND IMPROVEMENTS", "CONSTRUCTION"]):
            b.t(rng.choice([
                "The Lessee may erect temporary sheds and fencing, which the Lessee shall remove at its own cost on expiry of the lease.",
                "No permanent structure shall be erected without the prior written consent of the Lessor.",
            ]))
    if b.optional(0.2):
        with b.clause("COMPENSATION_ON_ACQUISITION", "land.acq", ["COMPENSATION ON ACQUISITION", "ACQUISITION"]):
            b.t("If the land is compulsorily acquired, compensation for the land shall belong to the Lessor and compensation for standing crops to the Lessee.")
    if b.optional(0.4):
        with b.clause("NOTICE_PERIOD", "land.notice", ["NOTICE PERIOD", "NOTICE OF TERMINATION"]):
            if b.chance(0.3) and not b.inject:
                b.risk("ASYMMETRIC_OBLIGATION", "asymmetric_notice")
                b.ob("The Lessee may surrender the lease only after giving the Lessor {a} written notice, ", actor="lessee",
                     action="SERVE_NOTICE", a=duration(rng.choice([6, 12]), "month", "NOTICE_PERIOD", "notice_lessee"))
                b.ob("while the Lessor may resume the land on {c} notice.", actor="lessor", action="SERVE_NOTICE",
                     c=duration(30, "day", "NOTICE_PERIOD", "notice_lessor", plain=True))
            else:
                b.emit("Either party may determine this lease before expiry by giving the other not less than {n} notice in writing.",
                       n=duration(rng.choice([3, 6]), "month", "NOTICE_PERIOD", "notice"))
                b.relation("HAS_NOTICE_PERIOD", "DOCUMENT", "notice")

    with b.clause("ENCUMBRANCE_DECLARATION", "land.enc", ["ENCUMBRANCE DECLARATION", "TITLE AND ENCUMBRANCES"]):
        b.emit(f"The Lessor declares that the land bearing {prefix} " + "{s} is free from all encumbrances.", s=ident(survey, "SURVEY_NUMBER", "survey"))

    with b.clause("TERMINATION", "land.term", ["TERMINATION", "TERMINATION AND FORFEITURE", "DETERMINATION OF LEASE"]):
        b.ob("Upon expiry or earlier determination of this lease, the Lessee shall restore vacant possession of the land to the Lessor.",
             actor="lessee", action="RESTORE_POSSESSION")
        if involved("RENT_CONTRADICTION") or b.chance(b.profile["restate"] * 0.5):
            r2 = alt_rent if active("RENT_CONTRADICTION") else annual_rent
            b.emit(" The Lessor may determine this lease if the annual rent of {r2} remains unpaid for two consecutive years.",
                   r2=money(r2, "RENT", "rent", b.currency, words=False))
    if involved("RENT_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "land_rent_single", ["rent"])

    if missing != "DISPUTE_RESOLUTION" and b.optional(0.75):
        dispute_clause(b, "land", loc, "Deed")
    jurisdiction_clause(b, "land", loc, "Deed")

    b.t("\n")
    with b.section("SCHEDULE_PROPERTY", "SCHEDULE OF THE PROPERTY"):
        s2 = alt_survey if active("SURVEY_NUMBER_CONTRADICTION") else survey
        a2 = alt_area if active("LAND_AREA_CONTRADICTION") else area_value
        b.emit(f"All that piece of land bearing {prefix} " + "{s}, admeasuring {a}, situated at Village {v}, Taluka {t}, District {d}, {st}.\n",
               s=ident(s2, "SURVEY_NUMBER", "survey"), a=area(a2, unit, "LAND_AREA", "area"),
               v=loc["village"], t=loc["taluka"], d=loc["district"], st=loc["state"])
        b.t(f"On or towards the North: land bearing {prefix} {vp.random_survey_number(kind)}\n")
        b.t(f"On or towards the South: {rng.choice(['village road', 'nala', 'cart track'])}\n")
    if involved("SURVEY_NUMBER_CONTRADICTION"):
        b.expect("PROPERTY_IDENTIFIER_CONTRADICTION", "land_survey_single", ["survey"])
    if involved("LAND_AREA_CONTRADICTION"):
        b.expect("PROPERTY_AREA_CONTRADICTION", "land_area_single", ["area"])

    b.t("\n")
    signatures(b, [("LESSOR", "LESSOR", "lessor", lessor["name"]), ("LESSEE", "LESSEE", "lessee", lessee["name"])], "Deed")
    return {"city": loc["city"], "state": loc["state"], "land_use_type": land_type, "permitted_use": use}
