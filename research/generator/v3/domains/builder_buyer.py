"""builder_buyer: promoter-allottee agreements for under-construction units."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import (dispute_clause, execution_line, jurisdiction_clause, parties, random_dates, signatures,
                      stamp_paper_line, title)
from ..core import DocBuilder, Ent, add_months, area, date_ent, duration, ident, money, percent, textual

DOMAIN = "builder_buyer"
DOCUMENT_TYPES = [("BUILDER_BUYER_AGREEMENT", 1.0)]
REQUIRED_LABELS = ["PROMOTER", "ALLOTTEE", "PROJECT", "UNIT", "CARPET_AREA", "SALE_CONSIDERATION", "POSSESSION_DATE"]

ADVERSARIAL = {
    "POSSESSION_DATE_CONTRADICTION": "DATE_CONTRADICTION",
    "CARPET_AREA_CONTRADICTION": "PROPERTY_AREA_CONTRADICTION",
    "PAYMENT_TOTAL_MISMATCH": "PAYMENT_TOTAL_MISMATCH",
}
REQUIRES: dict = {}
COUNTERFACTUALS = {
    "consideration": lambda v: v + rng.choice([5, 10, 20]) * 100_000,
    "possession_months": lambda v: v + rng.choice([6, 12]),
    "carpet": lambda v: v + rng.choice([20, 35, 50]),
}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"consideration": {"SALE_CONSIDERATION", "BOOKING_AMOUNT", "INSTALMENT_AMOUNT"}, "possession_months": {"POSSESSION_DATE"}, "carpet": {"CARPET_AREA"}}
QUESTION_LABELS = ["PROMOTER", "ALLOTTEE", "PROJECT", "UNIT", "CARPET_AREA", "SALE_CONSIDERATION",
                   "BOOKING_AMOUNT", "POSSESSION_DATE", "GRACE_PERIOD", "DEFECT_LIABILITY_PERIOD",
                   "REGISTRATION_REFERENCE", "PAYMENT_PLAN", "JURISDICTION"]

STAGES = ["completion of the plinth", "casting of the 3rd slab", "casting of the top slab", "completion of brickwork",
          "completion of internal plaster and flooring", "receipt of the occupancy certificate"]


def build(b: DocBuilder) -> dict:
    loc = vp.random_location()
    promoter = vp.random_company()
    allottee = vp.random_person()
    executed = random_dates(b)
    project = f"{rng.choice(vp.VILLAGE_ROOTS)} {rng.choice(['Greens', 'Heights', 'Residency', 'Park', 'Enclave', 'Gardens', 'Towers', 'Vista'])}"
    rera_no = f"P{rng.randint(51000000000, 52999999999)}"
    tower = rng.choice("ABCDEF")
    unit_no = f"{tower}-{rng.randint(1, 30)}{rng.randint(0, 1)}{rng.randint(1, 8)}"
    carpet_unit = rng.choice(["sq. ft.", "sq. mtrs."])
    carpet = b.val("carpet", lambda: rng.randrange(420, 1900, 5) if carpet_unit == "sq. ft." else rng.randrange(40, 175))
    consideration = b.val("consideration", lambda: rng.randrange(3_000_000, 25_000_000, 50_000))
    booking = int(round(consideration * rng.choice([0.05, 0.08, 0.1]), -3))
    n_stages = rng.randint(3, 5)
    stages = STAGES[:n_stages - 1] + [STAGES[-1]]
    weights = [rng.uniform(0.8, 1.2) for _ in stages]
    remaining = consideration - booking
    instalments = [int(round(remaining * w / sum(weights), -3)) for w in weights]
    instalments[-1] = remaining - sum(instalments[:-1])  # exact total
    possession_months = b.val("possession_months", lambda: rng.choice([24, 30, 36, 42, 48]))
    possession = add_months(executed, possession_months)
    grace_months = rng.choice([3, 6, 6])
    delay_rate = rng.choice([9, 10, 10.5, 11])
    cancellation_pct = rng.choice([5, 10, 10])
    refund_days = rng.choice([45, 60, 90])
    dlp_years = rng.choice([5, 5, 3])
    maintenance = rng.choice([2, 3, 4, 5]) * 1000 * rng.randint(1, 3)
    plan_name = rng.choice(["construction-linked payment plan", "time-linked payment plan", "down payment plan with construction-linked balance"])

    alt_possession = add_months(executed, possession_months + rng.choice([6, 12]))
    alt_carpet = carpet + (rng.choice([25, 40]) if carpet_unit == "sq. ft." else rng.choice([3, 5]))
    off_by = rng.choice([1, 2, 5]) * 100_000
    restate = b.chance(b.profile["restate"])
    unfair = rng.choice(["UNBOUNDED_DISCRETION", "ONE_SIDED_REMEDY", None, None])
    if not b.chance(0.4):
        unfair = None
    if b.inject:
        unfair = None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    title(b, "bb", ["AGREEMENT FOR SALE", "BUILDER BUYER AGREEMENT", "AGREEMENT FOR SALE OF APARTMENT", "APARTMENT BUYER AGREEMENT"])
    stamp_paper_line(b)
    execution_line(b, "bb", loc, executed, "EXECUTION_DATE", "Agreement")
    term_p = b.term("Promoter", ["Developer", "Builder"])
    parties(b, ("PROMOTER", "promoter", term_p, promoter), ("ALLOTTEE", "allottee", "Allottee", allottee))
    P = term_p

    with b.clause("PROJECT", "bb.project", ["THE PROJECT", "PROJECT DETAILS", "PROJECT AND RERA REGISTRATION"]):
        b.emit(b.pick("bb.project.b", [
            "The {p} is developing a residential project known as {proj} on land situated at {addr}, registered with the Real Estate Regulatory Authority under registration no. {rera}.",
            "The {p} is constructing the project {proj} at {addr}. The project is registered under the Real Estate (Regulation and Development) Act, 2016 bearing registration no. {rera}.",
        ]), p=P, proj=textual(project, "PROJECT", "project"),
            addr=textual(vp.random_property_address(loc), "PROJECT_ADDRESS", "project_addr"),
            rera=ident(rera_no, "REGISTRATION_REFERENCE", "rera"))
        b.relation("PROMOTER_OF", "promoter", "project")
        b.relation("LOCATED_AT", "project", "project_addr")
        b.relation("HAS_REGISTRATION", "project", "rera")
        b.emit(" The construction status as on date is {status}.", status=textual(
            rng.choice(["foundation work completed", "structure up to the 7th floor completed", "excavation in progress"]),
            "CONSTRUCTION_STATUS", "status"))

    with b.clause("UNIT_DESCRIPTION", "bb.unit", ["THE APARTMENT", "UNIT DETAILS", "DESCRIPTION OF THE UNIT"]):
        b.emit("The {p} agrees to allot to the Allottee Apartment No. {u} in Tower {tower} of the project, having a carpet area of {c} as defined under the Act, together with one covered car parking space.",
               p=P, u=ident(unit_no, "UNIT", "unit"), tower=tower, c=area(carpet, carpet_unit, "CARPET_AREA", "carpet"))
        for rel in [("ALLOTTED_TO", "unit", "allottee"), ("PART_OF_PROJECT", "unit", "project"), ("HAS_UNIT", "DOCUMENT", "unit"),
                    ("HAS_CARPET_AREA", "unit", "carpet")]:
            b.relation(*rel)

    with b.clause("CONSIDERATION", "bb.cons", ["CONSIDERATION", "TOTAL PRICE", "PRICE OF THE APARTMENT"]):
        b.emit("The total price of the Apartment is {c}, inclusive of the cost of the car parking space and proportionate common areas. ",
               c=money(consideration, "SALE_CONSIDERATION", "consideration", b.currency))
        b.relation("HAS_CONSIDERATION", "DOCUMENT", "consideration")
        b.ob("The Allottee has paid a booking amount of {bk} on the execution of this Agreement.",
             actor="allottee", action="PAY", amount="booking", purpose="BOOKING_AMOUNT",
             bk=money(booking, "BOOKING_AMOUNT", "booking", b.currency, words=False))
        b.relation("MUST_PAY", "allottee", "booking")

    with b.clause("PAYMENT_PLAN", "bb.plan", ["PAYMENT PLAN", "SCHEDULE OF PAYMENT", "INSTALMENTS"]):
        b.emit("The balance shall be paid under a {plan} as follows:\n", plan=textual(plan_name, "PAYMENT_PLAN", "plan"))
        b.relation("HAS_PAYMENT_PLAN", "DOCUMENT", "plan")
        shown = list(instalments)
        if active("PAYMENT_TOTAL_MISMATCH"):
            shown[-1] -= off_by
        for i, (stage, amount_value) in enumerate(zip(stages, shown)):
            key = f"inst_{i}"
            b.ob(f"({chr(97 + i)}) On {stage}, the Allottee shall pay {{amt}}.",
                 actor="allottee", action="PAY", amount=key, purpose="INSTALMENT", condition=stage,
                 amt=money(amount_value, "INSTALMENT_AMOUNT", key, b.currency, words=False))
            b.relation("MUST_PAY", "allottee", key)
            b.t("\n")
    if involved("PAYMENT_TOTAL_MISMATCH"):
        b.expect("PAYMENT_TOTAL_MISMATCH", "bb_payment_total", ["booking", "consideration"] + [f"inst_{i}" for i in range(len(stages))])

    with b.clause("POSSESSION", "bb.poss", ["POSSESSION", "DATE OF POSSESSION", "POSSESSION OF THE APARTMENT"]):
        b.ob("The {p} shall hand over possession of the Apartment to the Allottee on or before {pd}, ",
             actor="promoter", action="DELIVER_POSSESSION", deadline="possession", obj="UNIT",
             p=P, pd=date_ent(possession, "POSSESSION_DATE", "possession", b.date_style))
        b.relation("HAS_POSSESSION_DATE", "unit", "possession")
        b.relation("HANDOVER_TO", "promoter", "allottee")
        if unfair == "UNBOUNDED_DISCRETION":
            b.risk("UNBOUNDED_DISCRETION", "possession_extension_discretion")
            b.emit("which date the {p} may extend at its sole discretion for reasons it considers sufficient, without any liability to the Allottee.", p=P)
        else:
            b.emit("subject to a grace period of {g} for reasons beyond the {p}'s control.",
                   g=duration(grace_months, "month", "GRACE_PERIOD", "grace"), p=P)

    if unfair != "UNBOUNDED_DISCRETION":
        with b.clause("DELAY_COMPENSATION", "bb.delay", ["DELAY IN POSSESSION", "COMPENSATION FOR DELAY", "DELAYED HANDOVER"]):
            b.ob("If possession is delayed beyond the grace period, the {p} shall pay the Allottee interest at {r} per annum on the amounts paid, for every month of delay.",
                 actor="promoter", action="PAY_DELAY_COMPENSATION", condition="possession delayed beyond grace period",
                 p=P, r=percent(delay_rate, "DELAY_COMPENSATION", "delay_rate", f"{delay_rate:g}%"))
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="DELAY_COMPENSATION")

    if involved("POSSESSION_DATE_CONTRADICTION") or b.chance(b.profile["restate"] * 0.6):
        with b.clause("HANDOVER", "bb.handover", ["HANDOVER", "TAKING OVER OF POSSESSION"]):
            pd2 = alt_possession if active("POSSESSION_DATE_CONTRADICTION") else possession
            b.emit("The {p} shall intimate the Allottee to take possession upon receipt of the occupancy certificate, which is expected by {pd2}. ",
                   p=P, pd2=date_ent(pd2, "POSSESSION_DATE", "possession", b.date_style))
            b.ob("The Allottee shall take possession within two months of such intimation.",
                 actor="allottee", action="TAKE_POSSESSION")
    if involved("POSSESSION_DATE_CONTRADICTION"):
        b.expect("DATE_CONTRADICTION", "bb_possession_single", ["possession"])

    with b.clause("DEFECTS", "bb.defects", ["DEFECT LIABILITY", "STRUCTURAL DEFECTS", "DEFECTS"]):
        b.ob("If any structural defect or defect in workmanship is brought to the notice of the {p} within {dlp} from the date of handing over possession, the {p} shall rectify it without further charge within thirty days.",
             actor="promoter", action="RECTIFY_DEFECTS", p=P, dlp=duration(dlp_years, "year", "DEFECT_LIABILITY_PERIOD", "dlp"))

    if b.optional(0.6):
        with b.clause("MAINTENANCE", "bb.maint", ["MAINTENANCE", "MAINTENANCE CHARGES"]):
            b.ob("From the date of possession, the Allottee shall pay maintenance charges of {m} per month until the association of allottees takes over.",
                 actor="allottee", action="PAY", amount="maintenance", purpose="MAINTENANCE_CHARGE", frequency="MONTHLY",
                 m=money(maintenance, "MAINTENANCE_CHARGE", "maintenance", b.currency, words=False))
            b.relation("MUST_PAY", "allottee", "maintenance")

    with b.clause("CANCELLATION", "bb.cancel", ["CANCELLATION BY ALLOTTEE", "CANCELLATION", "WITHDRAWAL"]):
        if unfair == "ONE_SIDED_REMEDY":
            b.risk("ONE_SIDED_REMEDY", "one_sided_cancellation")
            b.emit("If the Allottee cancels the allotment for any reason, {cp} of the total price shall stand forfeited and the balance shall be refunded without interest when the Apartment is resold; the {p} may cancel the allotment at any time on any default.",
                   cp=percent(25, "CANCELLATION_CHARGE", "cancel_pct", "25%"), p=P)
        else:
            b.emit("The Allottee may cancel the allotment, in which case the {p} may deduct {cp} of the booking amount. ",
                   p=P, cp=percent(cancellation_pct, "CANCELLATION_CHARGE", "cancel_pct", f"{cancellation_pct}%"))
            b.ob("The {p} shall refund the balance to the Allottee within {rd} of cancellation.",
                 actor="promoter", action="REFUND", condition="on cancellation by allottee",
                 p=P, rd=duration(refund_days, "day", "REFUND_PERIOD", "refund_period", plain=True))
            b.relation("REFUND_TO", "promoter", "allottee")

    if unfair != "ONE_SIDED_REMEDY" and b.optional(0.35):
        with b.clause("REFUND", "bb.refund", ["REFUND", "REFUND OF AMOUNTS"]):
            b.ob("If the Promoter is unable to give possession of the Apartment, the Promoter shall refund all amounts received with interest within {rp} of the Allottee's demand.".replace("Promoter", P),
                 actor="promoter", action="REFUND", condition="promoter unable to give possession",
                 rp=duration(refund_days, "day", "REFUND_PERIOD", "refund_period", plain=True))
            b.relation("REFUND_TO", "promoter", "allottee")
    if b.optional(0.5):
        with b.clause("REGISTRATION", "bb.reg", ["REGISTRATION", "STAMP DUTY AND REGISTRATION"]):
            b.emit("This Agreement shall be registered with the Sub-Registrar; the stamp duty and registration charges shall be borne by the Allottee.")
    if b.optional(0.6):
        dispute_clause(b, "bb", loc, "Agreement")
    jurisdiction_clause(b, "bb", loc, "Agreement")

    if involved("CARPET_AREA_CONTRADICTION") or b.chance(b.profile["annex"] * 0.5):
        b.t("\n")
        with b.section("UNIT_DESCRIPTION", "ANNEXURE A - SPECIFICATIONS OF THE APARTMENT"):
            c2 = alt_carpet if active("CARPET_AREA_CONTRADICTION") else carpet
            b.emit("Apartment {u}: carpet area {c}; flooring vitrified tiles; doors laminated flush doors.\n",
                   u=ident(unit_no, "UNIT", "unit"), c=area(c2, carpet_unit, "CARPET_AREA", "carpet"))
    if involved("CARPET_AREA_CONTRADICTION"):
        b.expect("PROPERTY_AREA_CONTRADICTION", "bb_carpet_single", ["carpet"])

    b.t("\n")
    signatures(b, [(P.upper(), "PROMOTER", "promoter", promoter["name"]), ("ALLOTTEE", "ALLOTTEE", "allottee", allottee["name"])], "Agreement")
    return {"city": loc["city"], "state": loc["state"]}
