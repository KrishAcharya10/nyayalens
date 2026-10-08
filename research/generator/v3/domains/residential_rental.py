"""residential_rental: v2's rental generator ported to the v3 layers."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import (dispute_clause, execution_line, jurisdiction_clause, parties, person_or_company,
                      random_dates, signatures, stamp_paper_line, title)
from ..core import DocBuilder, Ent, add_months, date_ent, duration, money, percent

DOMAIN = "residential_rental"
DOCUMENT_TYPES = [("RESIDENTIAL_RENTAL", 1.0)]
REQUIRED_LABELS = ["LANDLORD", "TENANT", "RENT", "DURATION", "PROPERTY_ADDRESS"]

ADVERSARIAL = {
    "RENT_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "DEPOSIT_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "DURATION_CONTRADICTION": "DURATION_CONTRADICTION",
    "RENT_PAYER_REVERSAL": "PARTY_ROLE_INCONSISTENCY",
}
REQUIRES: dict = {}
COUNTERFACTUALS = {
    "rent": lambda v: v + rng.choice([1000, 2500, 5000]),
    "months": lambda v: {11: 24, 12: 36, 24: 11, 36: 60, 60: 12}[v],
    "notice_days": lambda v: {15: 30, 30: 60, 45: 90, 60: 30, 90: 60}[v],
}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"rent": {"RENT", "SECURITY_DEPOSIT"}, "months": {"DURATION", "EXPIRY_DATE"}, "notice_days": {"NOTICE_PERIOD"}}
QUESTION_LABELS = ["LANDLORD", "TENANT", "RENT", "SECURITY_DEPOSIT", "DURATION", "NOTICE_PERIOD", "LOCK_IN_PERIOD",
                   "PROPERTY_ADDRESS", "COMMENCEMENT_DATE", "EXPIRY_DATE", "ESCALATION_RATE", "JURISDICTION"]


def build(b: DocBuilder) -> dict:
    loc = vp.random_location()
    landlord = person_or_company(0.1)
    tenant = vp.random_person()
    executed = random_dates(b)
    start = executed + timedelta(days=rng.choice([0, 1, 5, 10, 15]))
    months = b.val("months", lambda: rng.choice([11, 11, 11, 12, 24, 36, 60]))
    rent = b.val("rent", lambda: vp.random_monthly_rent(loc["city"]))
    deposit = rent * rng.choice([2, 3, 3, 6, 10])
    notice_days = b.val("notice_days", lambda: rng.choice([15, 30, 45, 60, 90]))
    prop = vp.random_property_address(loc)

    alt_rent = rent + rng.choice([1000, 2000, 5000])
    alt_deposit = deposit + rent
    alt_months = {11: 12, 12: 11, 24: 12, 36: 24, 60: 36}[months]
    restate = b.chance(b.profile["restate"])
    unfair = rng.choice(["UNBOUNDED_DISCRETION", "LIABILITY_SHIFT", "ASYMMETRIC_OBLIGATION", None, None, None])
    if not b.chance(0.4):
        unfair = None
    missing = rng.choice(["SECURITY_DEPOSIT", "DISPUTE_RESOLUTION", None, None, None, None, None, None])
    if b.inject:
        unfair = missing = None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    title(b, "rent", ["RENT AGREEMENT", "RESIDENTIAL RENTAL AGREEMENT", "RENTAL AGREEMENT", "AGREEMENT OF TENANCY"])
    stamp_paper_line(b)
    execution_line(b, "rent", loc, executed, "EXECUTION_DATE", "Agreement")
    parties(b, ("LANDLORD", "landlord", "Landlord", landlord), ("TENANT", "tenant", "Tenant", tenant))
    b.emit(b.pick("rent.recital", [
        "WHEREAS the Landlord is the absolute owner of the residential premises situated at {addr} (hereinafter \"the Premises\"), and has agreed to let out the same to the Tenant on the following terms:\n\n",
        "WHEREAS the Landlord owns the residential flat bearing {addr} (hereinafter \"the Premises\") and the Tenant has requested the Landlord to let the Premises for residential use;\n\nNOW THIS AGREEMENT WITNESSETH AS FOLLOWS:\n\n",
        "The Landlord hereby lets, and the Tenant hereby takes on rent, the premises at {addr} (\"the Premises\") on the terms set out below.\n\n",
    ]), addr=Ent(prop, "PROPERTY_ADDRESS", "prop", {"value": prop.lower()}))
    b.relation("LETS_TO", "landlord", "tenant")
    b.relation("LOCATED_AT", "DOCUMENT", "prop")

    with b.clause("LEASE_DURATION", "rent.dur", ["LEASE DURATION", "DURATION OF AGREEMENT", "PERIOD OF TENANCY", "TERM OF TENANCY"]):
        b.emit(b.pick("rent.dur.b", [
            "This Agreement shall be valid for a period of {dur} commencing from {s} and ending on {e}.",
            "The tenancy hereby created shall be for a term of {dur} with effect from {s}, and shall expire on {e} unless renewed in writing.",
            "The term of this Agreement is {dur}, starting {s} and ending {e}, both days inclusive.",
        ]), dur=duration(months, "month", "DURATION", "duration"),
            s=date_ent(start, "COMMENCEMENT_DATE", "start", b.date_style),
            e=date_ent(add_months(start, months), "EXPIRY_DATE", "end", b.date_style))
        for rel in [("HAS_TERM", "DOCUMENT", "duration"), ("STARTS_ON", "DOCUMENT", "start"), ("ENDS_ON", "DOCUMENT", "end")]:
            b.relation(*rel)

    with b.clause("RENT_PAYMENT", "rent.rent", ["RENT", "RENT PAYMENT", "MONTHLY RENT", "PAYMENT OF RENT"]):
        reversal = active("RENT_PAYER_REVERSAL")
        payer, payee = ("Landlord", "Tenant") if reversal else ("Tenant", "Landlord")
        b.ob(b.pick("rent.rent.b", [
            "The {payer} shall pay to the {payee} a monthly rent of {rent} on or before the {due} day of each English calendar month.",
            "Rent for the Premises is fixed at {rent} per month, and the {payer} shall pay it to the {payee} in advance by the {due} of every month.",
            "The {payer} agrees to pay the {payee} a sum of {rent} per month towards rent, exclusive of electricity and water charges, by the {due} of each month.",
        ]), actor="landlord" if reversal else "tenant", action="PAY", amount="rent", purpose="RENT", frequency="MONTHLY",
            role_reversal=reversal, payer=payer, payee=payee, rent=money(rent, "RENT", "rent", b.currency),
            due=vp.ordinal(rng.choice([1, 5, 7, 10])))
        if not reversal:
            b.relation("MUST_PAY", "tenant", "rent")
    if involved("RENT_PAYER_REVERSAL"):
        b.expect("PARTY_ROLE_INCONSISTENCY", "rent_rent_payer", ["rent"])

    if missing != "SECURITY_DEPOSIT":
        with b.clause("SECURITY_DEPOSIT", "rent.dep", ["SECURITY DEPOSIT", "DEPOSIT", "INTEREST FREE DEPOSIT"]):
            b.ob("The Tenant shall pay an interest-free refundable security deposit of {d} to the Landlord before taking possession. ",
                 actor="tenant", action="PAY", amount="deposit", purpose="SECURITY_DEPOSIT",
                 d=money(deposit, "SECURITY_DEPOSIT", "deposit", b.currency))
            b.relation("MUST_PAY", "tenant", "deposit")
            if unfair == "UNBOUNDED_DISCRETION":
                b.risk("UNBOUNDED_DISCRETION", "deposit_deduction_discretion")
                b.emit(b.pick("rent.dep.unfair", [
                    "At the end of the tenancy the Landlord may retain such portion of the deposit as the Landlord, in the Landlord's sole judgement, considers necessary.",
                    "Refund of the deposit, and the quantum of any deductions therefrom, shall be entirely at the discretion of the Landlord.",
                ]))
            else:
                b.ob("The Landlord shall refund the deposit within {n} days of the Tenant handing over vacant possession, subject only to documented arrears.",
                     actor="landlord", action="REFUND_DEPOSIT", condition="on vacating", n=rng.choice([15, 30, 45]))
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="SECURITY_DEPOSIT")

    optional = []
    if b.optional(0.5):
        def escalation():
            with b.clause("RENT_ESCALATION", "rent.esc", ["RENT ESCALATION", "ENHANCEMENT OF RENT", "REVISION OF RENT"]):
                b.emit("The monthly rent shall stand increased by {r} upon every renewal.",
                       r=percent(rng.choice([5, 8, 10]), "ESCALATION_RATE", "escalation"))
        optional.append(escalation)
    if b.optional(0.35):
        def lock_in():
            with b.clause("LOCK_IN_PERIOD", "rent.lock", ["LOCK-IN PERIOD", "LOCK IN"]):
                b.emit("Neither party shall terminate this Agreement during a lock-in period of {l}, save for breach.",
                       l=duration(rng.choice([3, 6, 11]), "month", "LOCK_IN_PERIOD", "lock_in"))
                b.relation("HAS_LOCK_IN", "DOCUMENT", "lock_in")
        optional.append(lock_in)
    if b.optional(0.8):
        def maintenance():
            with b.clause("MAINTENANCE", "rent.maint", ["MAINTENANCE", "REPAIRS AND MAINTENANCE", "UPKEEP OF PREMISES"]):
                if unfair == "LIABILITY_SHIFT":
                    b.risk("LIABILITY_SHIFT", "structural_repairs_on_tenant")
                    b.ob(b.pick("rent.maint.unfair", [
                        "All repairs to the Premises, of whatever nature including structural repairs, seepage and damage to the roof or walls, shall be carried out by the Tenant at the Tenant's own cost.",
                        "The Tenant shall bear the entire cost of maintenance and repair of the Premises including the building structure, plumbing and electrical systems, irrespective of the cause of damage.",
                    ]), actor="tenant", action="MAINTAIN")
                else:
                    b.ob("The Tenant shall carry out day-to-day maintenance of the Premises. ", actor="tenant", action="MAINTAIN")
                    b.ob("Major and structural repairs shall be carried out by the Landlord at the Landlord's cost.",
                         actor="landlord", action="MAINTAIN")
        optional.append(maintenance)
    for prob, ctype, key, headings, body in [
        (0.6, "UTILITIES", "rent.util", ["UTILITIES", "ELECTRICITY AND WATER CHARGES"], "The Tenant shall pay electricity and water charges as per the meters installed in the Premises."),
        (0.5, "USE_OF_PREMISES", "rent.use", ["USE OF PREMISES", "PURPOSE"], "The Premises shall be used only for residential purposes."),
        (0.5, "SUBLETTING", "rent.sublet", ["SUBLETTING", "NO SUB-LETTING"], "The Tenant shall not sublet or part with possession of the Premises without the Landlord's written consent."),
        (0.3, "ALTERATIONS", "rent.alter", ["ALTERATIONS", "ADDITIONS AND ALTERATIONS"], "The Tenant shall not make structural alterations to the Premises."),
        (0.3, "ENTRY_AND_INSPECTION", "rent.inspect", ["INSPECTION", "RIGHT OF ENTRY"], "The Landlord may inspect the Premises at reasonable hours after giving prior intimation."),
        (0.4, "STAMP_DUTY_AND_REGISTRATION", "rent.stamp", ["STAMP DUTY AND REGISTRATION", "REGISTRATION CHARGES"], "The stamp duty and registration charges shall be shared equally by the parties."),
        (0.25 if loc["state"] in ("Maharashtra", "Delhi", "Karnataka", "Uttar Pradesh") else 0.0, "POLICE_VERIFICATION", "rent.police", ["POLICE VERIFICATION"], "The Tenant shall furnish identity documents for police verification, and the Landlord shall submit the tenant verification form to the local police station."),
        (0.2, "INDEMNITY", "rent.indemnity", ["INDEMNITY"], "Each party shall indemnify the other against losses caused by its own breach of this Agreement."),
        (0.15, "FORCE_MAJEURE", "rent.fm", ["FORCE MAJEURE"], "Neither party shall be liable for failure to perform due to fire, flood, epidemic or any act of God beyond its control."),
    ]:
        if b.optional(prob):
            optional.append(lambda c=ctype, k=key, h=headings, t=body: _simple(b, c, k, h, t))
    rng.shuffle(optional)
    for fn in optional:
        fn()

    with b.clause("NOTICE_PERIOD", "rent.notice", ["NOTICE PERIOD", "TERMINATION NOTICE", "NOTICE FOR VACATING"]):
        if unfair == "ASYMMETRIC_OBLIGATION":
            b.risk("ASYMMETRIC_OBLIGATION", "asymmetric_notice")
            b.ob("The Tenant may vacate only after giving the Landlord {a} written notice, ", actor="tenant", action="SERVE_NOTICE",
                 a=duration(90, "day", "NOTICE_PERIOD", "notice_tenant", plain=True))
            b.ob("whereas the Landlord may require the Tenant to vacate by giving {c} notice.", actor="landlord", action="SERVE_NOTICE",
                 c=duration(15, "day", "NOTICE_PERIOD", "notice_landlord", plain=True))
        else:
            b.emit(b.pick("rent.notice.b", [
                "Either party may terminate this Agreement by giving {n} written notice to the other party.",
                "Either the Landlord or the Tenant may bring this tenancy to an end by giving not less than {n} prior written notice.",
            ]), n=duration(notice_days, "day", "NOTICE_PERIOD", "notice", plain=True))
            b.relation("HAS_NOTICE_PERIOD", "DOCUMENT", "notice")

    with b.clause("TERMINATION", "rent.term", ["TERMINATION", "TERMINATION AND DEFAULT", "DETERMINATION OF TENANCY"]):
        b.ob("Upon expiry or earlier termination of this Agreement, the Tenant shall hand over vacant and peaceful possession of the Premises to the Landlord.",
             actor="tenant", action="VACATE")
        if involved("DEPOSIT_CONTRADICTION") or (restate and missing != "SECURITY_DEPOSIT"):
            d2 = alt_deposit if active("DEPOSIT_CONTRADICTION") else deposit
            b.emit(" On such handover the Landlord shall return the security deposit of {d2}" + b.cross_ref("SECURITY_DEPOSIT", " paid under Clause {n}") + ".",
                   d2=money(d2, "SECURITY_DEPOSIT", "deposit", b.currency, words=False))
        if involved("DURATION_CONTRADICTION") or restate:
            m2 = alt_months if active("DURATION_CONTRADICTION") else months
            b.emit(" This {m2} tenancy may be renewed by mutual written consent.",
                   m2=duration(m2, "month", "DURATION", "duration", plain=True))
    if involved("DEPOSIT_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "rent_deposit_single", ["deposit"])
    if involved("DURATION_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "rent_duration_single", ["duration"])

    if missing != "DISPUTE_RESOLUTION" and b.optional(0.8):
        dispute_clause(b, "rent", loc, "Agreement")
    jurisdiction_clause(b, "rent", loc, "Agreement")

    if involved("RENT_CONTRADICTION") or b.chance(b.profile["annex"] * 0.5):
        r2 = alt_rent if active("RENT_CONTRADICTION") else rent
        b.emit("\nRENT RECEIPT\nReceived from the Tenant a sum of {r} towards rent for the first month.\n",
               r=money(r2, "RENT", "rent", b.currency, words=False))
    if involved("RENT_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "rent_rent_single", ["rent"])

    b.t("\n")
    signatures(b, [("LANDLORD", "LANDLORD", "landlord", landlord["name"]), ("TENANT", "TENANT", "tenant", tenant["name"])], "Agreement")
    return {"city": loc["city"], "state": loc["state"]}


def _simple(b: DocBuilder, clause_type: str, key: str, headings: list[str], body: str) -> None:
    with b.clause(clause_type, key, headings):
        b.t(body)
