"""leave_and_license: residential leave and licence agreements."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import (dispute_clause, execution_line, jurisdiction_clause, parties, person_or_company,
                      random_dates, signatures, stamp_paper_line, title)
from ..core import DocBuilder, Ent, add_months, date_ent, duration, money, percent, textual

DOMAIN = "leave_and_license"
DOCUMENT_TYPES = [("LEAVE_AND_LICENSE", 1.0)]
REQUIRED_LABELS = ["LICENSOR", "LICENSEE", "LICENSED_PREMISES", "LICENSE_FEE", "LICENSE_PERIOD"]

ADVERSARIAL = {
    "LICENSE_TERM_CONTRADICTION": "DURATION_CONTRADICTION",
    "FEE_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "NOTICE_PERIOD_CONTRADICTION": "DURATION_CONTRADICTION",
    "FEE_PAYER_REVERSAL": "PARTY_ROLE_INCONSISTENCY",
}
REQUIRES: dict = {}
COUNTERFACTUALS = {
    "fee": lambda v: v + rng.choice([2000, 5000, 10000]),
    "notice_days": lambda v: {15: 30, 30: 60, 45: 90, 60: 30, 90: 60}[v],
    "months": lambda v: {11: 24, 12: 36, 24: 11, 36: 12}[v],
}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"fee": {"LICENSE_FEE", "SECURITY_DEPOSIT"}, "notice_days": {"NOTICE_PERIOD"}, "months": {"LICENSE_PERIOD", "EXPIRY_DATE"}}
QUESTION_LABELS = ["LICENSOR", "LICENSEE", "LICENSED_PREMISES", "LICENSE_FEE", "SECURITY_DEPOSIT",
                   "LICENSE_PERIOD", "NOTICE_PERIOD", "LOCK_IN_PERIOD", "COMMENCEMENT_DATE", "EXPIRY_DATE",
                   "PERMITTED_USE", "JURISDICTION"]


def build(b: DocBuilder) -> dict:
    loc = vp.random_location()
    if rng.random() < 0.75:  # leave and licence is above all a Maharashtra instrument
        while loc["state"] != "Maharashtra":
            loc = vp.random_location()
    licensor = person_or_company(0.1)
    licensee = vp.random_person()
    executed = random_dates(b)
    start = executed + timedelta(days=rng.choice([0, 1, 5, 10]))
    months = b.val("months", lambda: rng.choice([11, 11, 11, 12, 24, 36]))
    end = add_months(start, months)
    fee = b.val("fee", lambda: vp.random_monthly_rent(loc["city"]))
    deposit = fee * rng.choice([3, 3, 5, 6, 10])
    notice_days = b.val("notice_days", lambda: rng.choice([15, 30, 30, 45, 60, 90]))
    lock_months = rng.choice([3, 6, 11])
    premises = vp.random_property_address(loc)
    use = rng.choice(["residential use by the Licensee and the Licensee's family", "residence of the Licensee only",
                      "residential purposes and for no other purpose"])

    alt_months = {11: 12, 12: 11, 24: 23, 36: 24}[months]
    alt_fee = fee + rng.choice([1000, 2500, 5000])
    alt_notice = {15: 30, 30: 60, 45: 30, 60: 90, 90: 60}[notice_days]
    restate = b.chance(b.profile["restate"])
    unfair = rng.choice(["UNBOUNDED_DISCRETION", "ASYMMETRIC_OBLIGATION", "LIABILITY_SHIFT", None, None, None])
    if not b.chance(0.4):
        unfair = None
    missing = rng.choice(["NO_TENANCY", "SECURITY_DEPOSIT", None, None, None, None, None, None, None])
    if b.inject:
        unfair = missing = None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    title(b, "ll", ["LEAVE AND LICENSE AGREEMENT", "LEAVE AND LICENCE AGREEMENT", "AGREEMENT OF LEAVE AND LICENSE", "LICENSE AGREEMENT"])
    stamp_paper_line(b)
    execution_line(b, "ll", loc, executed, "EXECUTION_DATE", "Agreement")
    parties(b, ("LICENSOR", "licensor", "Licensor", licensor), ("LICENSEE", "licensee", "Licensee", licensee))
    b.emit(b.pick("ll.recital", [
        "WHEREAS the Licensor is the owner of the premises situated at {p} (hereinafter \"the Licensed Premises\"), and the Licensee has requested the Licensor to permit the Licensee to use the Licensed Premises on leave and license basis for {use};\n\n",
        "WHEREAS the Licensor has agreed to grant the Licensee a license to occupy the premises at {p} (\"the Licensed Premises\") for {use}, on the terms below;\n\n",
        "The Licensor, being the owner of {p} (\"the Licensed Premises\"), permits the Licensee to use the same for {use} on leave and license basis, as follows.\n\n",
    ]), p=Ent(premises, "LICENSED_PREMISES", "premises", {"value": premises.lower()}),
        use=textual(use, "PERMITTED_USE", "use"))
    for rel in [("LICENSOR_OF", "licensor", "premises"), ("LICENSES", "licensor", "licensee"),
                ("OCCUPIES", "licensee", "premises"), ("USED_FOR", "premises", "use")]:
        b.relation(*rel)

    with b.clause("LICENSE_PERIOD", "ll.period", ["LICENSE PERIOD", "PERIOD OF LICENSE", "DURATION", "TERM OF THE LICENSE"]):
        b.emit(b.pick("ll.period.b", [
            "This license is granted for a period of {dur} commencing from {s} and ending on {e}.",
            "The Licensee shall be entitled to use the Licensed Premises for {dur}, from {s} to {e}, both days inclusive.",
            "The license hereby granted shall be for {dur} with effect from {s}, and shall expire on {e} unless renewed in writing.",
        ]), dur=duration(months, "month", "LICENSE_PERIOD", "period"),
            s=date_ent(start, "COMMENCEMENT_DATE", "start", b.date_style), e=date_ent(end, "EXPIRY_DATE", "end", b.date_style))
        b.relation("HAS_TERM", "DOCUMENT", "period")
        b.relation("STARTS_ON", "DOCUMENT", "start")
        b.relation("TERMINATES_ON", "DOCUMENT", "end")

    with b.clause("LICENSE_FEE", "ll.fee", ["LICENSE FEE", "LICENCE FEE", "COMPENSATION", "MONTHLY LICENSE FEE"]):
        reversal = active("FEE_PAYER_REVERSAL")
        payer, payee = ("Licensor", "Licensee") if reversal else ("Licensee", "Licensor")
        b.ob(b.pick("ll.fee.b", [
            "The {payer} shall pay to the {payee} a monthly license fee of {fee} on or before the {due} day of each month.",
            "A license fee of {fee} per month shall be paid by the {payer} to the {payee} in advance, by the {due} of every month.",
            "The {payer} agrees to pay {fee} per month as compensation for the use of the Licensed Premises, by bank transfer before the {due} of each month.",
        ]), actor="licensor" if reversal else "licensee", action="PAY", amount="fee", purpose="LICENSE_FEE",
            frequency="MONTHLY", role_reversal=reversal, payer=payer, payee=payee,
            fee=money(fee, "LICENSE_FEE", "fee", b.currency), due=vp.ordinal(rng.choice([1, 5, 7, 10])))
        if not reversal:
            b.relation("MUST_PAY", "licensee", "fee")
    if involved("FEE_PAYER_REVERSAL"):
        b.expect("PARTY_ROLE_INCONSISTENCY", "ll_fee_payer", ["fee"])

    if missing != "SECURITY_DEPOSIT":
        with b.clause("SECURITY_DEPOSIT", "ll.dep", ["SECURITY DEPOSIT", "REFUNDABLE DEPOSIT", "INTEREST FREE DEPOSIT"]):
            b.ob("The Licensee shall pay an interest-free refundable security deposit of {d} to the Licensor on execution of this Agreement. ",
                 actor="licensee", action="PAY", amount="deposit", purpose="SECURITY_DEPOSIT",
                 d=money(deposit, "SECURITY_DEPOSIT", "deposit", b.currency))
            b.relation("MUST_PAY", "licensee", "deposit")
            if unfair == "UNBOUNDED_DISCRETION":
                b.risk("UNBOUNDED_DISCRETION", "deposit_deduction_discretion")
                b.emit("The Licensor may deduct from the deposit any amount the Licensor considers appropriate, and the Licensor's decision shall be final.")
            else:
                b.ob("The Licensor shall refund the deposit within {n} days of the Licensee vacating the Licensed Premises, after deducting only documented arrears.",
                     actor="licensor", action="REFUND_DEPOSIT", condition="on vacating", n=rng.choice([7, 15, 30]))
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="SECURITY_DEPOSIT")

    optional = []
    if b.optional(0.5):
        def escalation():
            with b.clause("ESCALATION", "ll.esc", ["ESCALATION", "ENHANCEMENT OF LICENSE FEE", "REVISION OF FEE"]):
                b.emit("On renewal, the license fee shall stand increased by {r}.",
                       r=percent(rng.choice([5, 8, 10]), "ESCALATION_RATE", "escalation"))
        optional.append(escalation)
    if b.optional(0.4):
        def lock_in():
            with b.clause("LOCK_IN_PERIOD", "ll.lock", ["LOCK-IN PERIOD", "LOCK IN"]):
                b.emit("Neither party shall terminate this Agreement during a lock-in period of {l} from the commencement date, save for breach.",
                       l=duration(lock_months, "month", "LOCK_IN_PERIOD", "lock_in"))
                b.relation("HAS_LOCK_IN", "DOCUMENT", "lock_in")
        optional.append(lock_in)
    if b.optional(0.7):
        def maintenance():
            with b.clause("MAINTENANCE", "ll.maint", ["MAINTENANCE", "REPAIRS AND MAINTENANCE", "MAINTENANCE AND REPAIRS"]):
                if unfair == "LIABILITY_SHIFT":
                    b.risk("LIABILITY_SHIFT", "structural_repairs_on_licensee")
                    b.ob("The Licensee shall carry out all repairs, including structural repairs and seepage, at the Licensee's own cost.",
                         actor="licensee", action="MAINTAIN")
                else:
                    b.ob("The Licensee shall keep the Licensed Premises clean and carry out minor day-to-day repairs.",
                         actor="licensee", action="MAINTAIN")
                    b.t(" ")
                    b.ob("Structural repairs shall be carried out by the Licensor at the Licensor's cost.",
                         actor="licensor", action="MAINTAIN")
        optional.append(maintenance)
    if b.optional(0.5):
        def utilities():
            with b.clause("UTILITIES", "ll.util", ["UTILITIES", "ELECTRICITY AND WATER CHARGES", "OUTGOINGS"]):
                b.ob("The Licensee shall pay electricity, water and gas charges for the license period directly to the authorities concerned.",
                     actor="licensee", action="PAY", purpose="UTILITIES")
        optional.append(utilities)
    if b.optional(0.5):
        def registration():
            with b.clause("REGISTRATION", "ll.reg", ["REGISTRATION", "STAMP DUTY AND REGISTRATION"]):
                b.ob("The Licensor shall get this Agreement registered with the Sub-Registrar at " + loc["city"] + ".",
                     actor="licensor", action="REGISTER")
                b.t(" The stamp duty and registration charges shall be shared equally.")
        optional.append(registration)
    for prob, ctype, key, headings, body in [
        (0.4, "POSSESSION", "ll.poss", ["POSSESSION", "HANDOVER OF PREMISES"], "The Licensor shall permit the Licensee to occupy the Licensed Premises on the commencement date, together with the fixtures listed in the annexure."),
        (0.4, "PERMITTED_USE", "ll.use", ["USE OF PREMISES", "PURPOSE"], "The Licensee shall not use the Licensed Premises for any commercial or illegal purpose and shall abide by the rules of the society."),
        (0.35, "RENEWAL", "ll.renew", ["RENEWAL", "OPTION TO RENEW"], "This license may be renewed for a further period on terms mutually agreed in writing before its expiry."),
    ]:
        if b.optional(prob):
            optional.append(lambda c=ctype, k=key, h=headings, t=body: _simple(b, c, k, h, t))
    rng.shuffle(optional)
    for fn in optional:
        fn()

    with b.clause("NOTICE_PERIOD", "ll.notice", ["NOTICE PERIOD", "NOTICE FOR TERMINATION", "NOTICE"]):
        if unfair == "ASYMMETRIC_OBLIGATION":
            b.risk("ASYMMETRIC_OBLIGATION", "asymmetric_notice")
            b.ob("The Licensee shall give the Licensor {a} written notice before vacating. ",
                 actor="licensee", action="SERVE_NOTICE", a=duration(90, "day", "NOTICE_PERIOD", "notice_licensee", plain=True))
            b.ob("The Licensor may revoke this license by giving the Licensee {c} notice.",
                 actor="licensor", action="SERVE_NOTICE", c=duration(7, "day", "NOTICE_PERIOD", "notice_licensor", plain=True))
        else:
            # A mutual right to terminate, not one party's obligation - no obligation recorded.
            b.emit(b.pick("ll.notice.b", [
                "Either party may terminate this Agreement by giving {n} written notice to the other party.",
                "This license may be terminated by either the Licensor or the Licensee on giving not less than {n} notice in writing.",
            ]), n=duration(notice_days, "day", "NOTICE_PERIOD", "notice", plain=True))
            b.relation("HAS_NOTICE_PERIOD", "DOCUMENT", "notice")

    if missing != "NO_TENANCY":
        with b.clause("NO_TENANCY", "ll.notenancy", ["NO TENANCY", "NATURE OF AGREEMENT", "NO TENANCY CREATED"]):
            b.emit(b.pick("ll.notenancy.b", [
                "Nothing in this Agreement shall be construed as creating any tenancy, lease or other interest in the Licensed Premises in favour of the Licensee.",
                "This Agreement is a license and shall not create a tenancy; the Licensee shall have no right, title or interest in the Licensed Premises.",
            ]))
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="NO_TENANCY")

    with b.clause("TERMINATION", "ll.term", ["TERMINATION", "REVOCATION OF LICENSE", "TERMINATION AND HANDOVER"]):
        b.ob("On expiry or earlier termination of this license, the Licensee shall hand back vacant possession of the Licensed Premises to the Licensor.",
             actor="licensee", action="VACATE")
        if involved("NOTICE_PERIOD_CONTRADICTION") or (restate and unfair != "ASYMMETRIC_OBLIGATION"):
            n2 = alt_notice if active("NOTICE_PERIOD_CONTRADICTION") else notice_days
            b.emit(" For the avoidance of doubt, either party may end this license on {n2} notice" + b.cross_ref("NOTICE_PERIOD", " as stated in Clause {n}") + ".",
                   n2=duration(n2, "day", "NOTICE_PERIOD", "notice", plain=True))
        if involved("LICENSE_TERM_CONTRADICTION") or restate:
            m2 = alt_months if active("LICENSE_TERM_CONTRADICTION") else months
            b.emit(" Upon expiry of this {m2} license, a fresh agreement may be executed on mutually agreed terms.",
                   m2=duration(m2, "month", "LICENSE_PERIOD", "period", plain=True))
    if involved("NOTICE_PERIOD_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "ll_notice_single", ["notice"])
    if involved("LICENSE_TERM_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "ll_period_single", ["period"])

    if b.optional(0.6):
        dispute_clause(b, "ll", loc, "Agreement")
    jurisdiction_clause(b, "ll", loc, "Agreement")

    if involved("FEE_CONTRADICTION") or b.chance(b.profile["annex"] * 0.5):
        # A receipt is not a clause: written as plain text after the clauses.
        f2 = alt_fee if active("FEE_CONTRADICTION") else fee
        b.emit("\nRECEIPT\nReceived from the Licensee a sum of {f} towards the license fee for the first month.\n",
               f=money(f2, "LICENSE_FEE", "fee", b.currency, words=False))
    if involved("FEE_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "ll_fee_single", ["fee"])

    b.t("\n")
    signatures(b, [("LICENSOR", "LICENSOR", "licensor", licensor["name"]), ("LICENSEE", "LICENSEE", "licensee", licensee["name"])], "Agreement")
    return {"city": loc["city"], "state": loc["state"]}


def _simple(b: DocBuilder, clause_type: str, key: str, headings: list[str], body: str) -> None:
    with b.clause(clause_type, key, headings):
        b.t(body)
