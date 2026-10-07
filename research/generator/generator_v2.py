"""
NyayaLens synthetic document generator, v2.

Same labeling discipline as generator.py (v1): every labeled value is
appended via BuiltDocument.append_entity, so its character offsets are
exact by construction, and every document must pass verify_offsets()
before it is written. The labels.json schema is unchanged apart from
extra metadata, so services/ml/dataset.py loads v2 as-is.

What v2 adds over v1 (see research/generator/README.md for the rationale):
  - Consistency: city/state/High Court/land-record vocabulary agree;
    land deeds never say "Landlord", rentals never say "Lessor"; land
    rent is annual and its default clause speaks in years, not months.
  - Variety: 6 heading styles (v1 had exactly one), 2-5 phrasings per
    clause, 21 clause types (v1: 11), long-form Indian party descriptions,
    company parties, lakh-grouped amounts with Rs./INR/rupee prefixes and
    amounts-in-words, 5 date formats, a property schedule with boundary
    survey numbers (unlabeled hard negatives), witnesses, annexures.
  - New labels: EXECUTION_DATE, COMMENCEMENT_DATE, EXPIRY_DATE,
    PROPERTY_ADDRESS, ESCALATION_RATE, LOCK_IN_PERIOD, KHATA_NUMBER,
    EASEMENT_RIGHT, WITNESS. KHATA_NUMBER / EASEMENT_RIGHT /
    CROP_OR_CULTIVATION_RIGHTS were already in the app's rule patterns and
    clause taxonomy but untestable, since v1 never produced them.
  - Risk ground truth: some documents carry an unfair clause variant
    (LIABILITY_SHIFT, UNBOUNDED_DISCRETION, ASYMMETRIC_OBLIGATION,
    LAND_USE_CONTRADICTION), recorded in metadata.injected_risks. These
    are phrased independently of the risk engine's regexes - unlike
    adversarial_generator.py, which was written to match them.
  - Held-out templates: for every pick() pool of 3+ variants, the last
    ~25% are never used by train/dev documents. Test documents draw from
    them half the time, so test-split scores measure generalisation to
    unseen phrasings/headings, not template memorisation.
"""

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta

import value_pools_v2 as vp
from generator import BuiltDocument, verify_offsets
from value_pools_v2 import rng

GENERATOR_VERSION = "2.0"

HEADING_STYLES = ["numbered_caps", "numbered_title", "clause_word", "paren", "article_roman", "inline"]
CANONICAL_HEADING_STYLE = "numbered_caps"  # the only style v1 (and the app's segmenter) handles

RISK_RATE = 0.15  # chance of each eligible unfair variant being injected

_ROMAN = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def roman(n: int) -> str:
    out = ""
    for value, sym in _ROMAN:
        while n >= value:
            out += sym
            n -= value
    return out


def title_case(heading: str) -> str:
    small = {"and", "of", "on", "the", "for", "to"}
    words = heading.lower().split(" ")
    return " ".join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))


@dataclass
class Ent:
    """A labeled value inside a template. `suffix` is emitted right after
    the span but outside it (e.g. the "/-" and amount-in-words of a sum)."""

    text: str
    label: str
    suffix: str = ""


_PLACEHOLDER = re.compile(r"\{(\w+)\}")


class DocBuilder:
    def __init__(self, doc_id: str, document_type: str, split: str, heading_style: str):
        self.doc = BuiltDocument(doc_id=doc_id, document_type=document_type)
        self.split = split
        self.heading_style = heading_style
        self.templates: list[str] = []
        self.heldout_templates: list[str] = []
        self.injected_risks: list[dict] = []
        self.next_no = 1

    # -- low-level emission ---------------------------------------------------
    def t(self, text: str) -> None:
        self.doc.append(text)

    def e(self, text: str, label: str) -> None:
        self.doc.append_entity(text, label)

    def emit(self, template: str, **values) -> None:
        """Render `template`, labeling every placeholder whose value is an Ent."""
        pos = 0
        for m in _PLACEHOLDER.finditer(template):
            self.t(template[pos:m.start()])
            value = values[m.group(1)]
            if isinstance(value, Ent):
                self.e(value.text, value.label)
                self.t(value.suffix)
            else:
                self.t(str(value))
            pos = m.end()
        self.t(template[pos:])

    # -- template choice with held-out variants -------------------------------
    def pick(self, key: str, variants: list):
        n = len(variants)
        n_held = max(1, n // 4) if n >= 3 else 0
        if self.split == "test" and n_held and rng.random() < 0.5:
            idx = rng.randrange(n - n_held, n)
        else:
            idx = rng.randrange(n - n_held)
        tag = f"{key}#{idx}"
        self.templates.append(tag)
        if idx >= n - n_held:
            self.heldout_templates.append(tag)
        return variants[idx]

    # -- structure ------------------------------------------------------------
    def heading(self, n: int, heading: str) -> None:
        style = self.heading_style
        if style == "numbered_caps":
            self.t(f"{n}. {heading.upper()}\n")
        elif style == "numbered_title":
            self.t(f"{n}. {title_case(heading)}\n")
        elif style == "clause_word":
            self.t(f"Clause {n}: {title_case(heading)}\n")
        elif style == "paren":
            self.t(f"{n}) {heading.upper()}\n")
        elif style == "article_roman":
            self.t(f"ARTICLE {roman(n)} - {heading.upper()}\n")
        else:  # inline
            self.t(f"{n}. {title_case(heading)}: ")

    def clause(self, clause_type: str, heading: str, body: str, **values) -> None:
        start = self.doc.start_clause()
        n = self.next_no
        self.heading(n, heading)
        self.emit(body, **values)
        self.t("\n\n")
        self.doc.end_clause(start, clause_type, str(n))
        self.next_no += 1

    def risk(self, category: str, clause_type: str, **detail) -> None:
        self.injected_risks.append({"category": category, "clause_type": clause_type, "detail": detail})


# --- shared pieces ------------------------------------------------------------

def money(n: int, label: str, style) -> Ent:
    span, suffix = vp.format_amount(n, style)
    return Ent(span, label, suffix)


def add_months(start: date, months: int) -> date:
    """Expiry date of a term starting on `start`: the day before the same
    calendar day `months` later (clamped to that month's last day)."""
    total = start.year * 12 + start.month - 1 + months
    year, month = total // 12, total % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day) - timedelta(days=1)


def party_block(b: DocBuilder, role: str, role_word: str, party: dict, fmt: str, side: str) -> None:
    """One party's description. `role` is both the label and the defined
    term (LANDLORD/TENANT/LESSOR/LESSEE)."""
    if fmt == "v1":
        b.t(f"{role}: ")
        b.e(party["name"], role)
        b.t(f", hereinafter referred to as the '{role_word}'")
        return
    if party["is_company"]:
        sig = party["signatory"]
        office = vp.random_property_address(vp.random_location())
        kind = "limited liability partnership registered under the LLP Act, 2008" if "LLP" in party["name"] \
            else "company incorporated under the Companies Act, 2013"
        b.t("M/s. ")
        b.e(party["name"], role)
        b.t(f", a {kind}, having its registered office at {office}, through its authorised signatory "
            f"{sig['honorific']} {sig['name']}, ")
        successors = "its successors and permitted assigns"
    else:
        residence = vp.random_property_address(vp.random_location())
        b.t(f"{party['honorific']} ")
        b.e(party["name"], role)
        b.t(f", aged about {party['age']} years, {party['relation']} {party['parent']}, residing at {residence}, ")
        successors = f"{party['pronoun']} heirs, executors, administrators and assigns"
    b.t(f'hereinafter referred to as the "{role}" (which expression shall, unless repugnant to the context '
        f"or meaning thereof, mean and include {successors}) of the {side} PART")


def parties(b: DocBuilder, first: tuple, second: tuple) -> None:
    fmt = "v1" if rng.random() < 0.3 else "long"
    party_block(b, *first, fmt, "ONE")
    b.t(",\n\nAND\n\n" if fmt == "v1" else ";\n\nAND\n\n")
    party_block(b, *second, fmt, "OTHER")
    b.t(".\n\n")


def signatures(b: DocBuilder, first: tuple, second: tuple, deed_word: str) -> None:
    b.t(f"IN WITNESS WHEREOF, the parties hereto have signed this {deed_word} on the day, month and year "
        "first above written.\n\n")
    for role, party in (first, second):
        b.t(f"{role}\n(")
        b.e(party["name"], role)
        b.t(")\n\n")
    if rng.random() < 0.85:
        b.t("WITNESSES:\n")
        for i in (1, 2):
            b.t(f"{i}. ")
            b.e(vp.random_person()["name"], "WITNESS")
            b.t(f", {vp.random_location()['city']}\n")


def heading_for(b: DocBuilder, key: str, options: list[str]) -> str:
    return b.pick(f"{key}.h", options)


# --- residential rental -----------------------------------------------------

def build_residential_rental(doc_id: str, split: str, heading_style: str) -> tuple[BuiltDocument, DocBuilder]:
    b = DocBuilder(doc_id, "residential_rental", split, heading_style)
    loc = vp.random_location()
    landlord = vp.random_company() if rng.random() < 0.1 else vp.random_person()
    tenant = vp.random_person()
    cur = vp.pick_currency_style()
    date_style = rng.randrange(vp.DATE_STYLES)
    fmt_date = lambda dt: vp.format_date(dt.day, dt.month, dt.year, date_style)  # noqa: E731

    d, m, y = vp.random_date()
    executed = date(y, m, d)
    start = executed + timedelta(days=rng.choice([0, 1, 5, 10, 15]))
    months = rng.choice([11, 11, 11, 12, 24, 36, 60])
    rent = vp.random_monthly_rent(loc["city"])
    deposit = rent * rng.choice([2, 3, 3, 6, 10])
    prop_addr = vp.random_property_address(loc)

    # Preamble
    b.t(b.pick("rent.title", ["RENT AGREEMENT", "RESIDENTIAL RENTAL AGREEMENT", "RENTAL AGREEMENT",
                              "AGREEMENT OF TENANCY"]) + "\n\n")
    if rng.random() < 0.4:
        b.t(f"(On Non-Judicial Stamp Paper of Rs. {rng.choice([100, 200, 500])}/-)\n\n")
    b.emit(b.pick("rent.exec", [
        "This Rental Agreement is made and executed at {city} on this {when}, between:\n\n",
        "This Agreement is executed at {city} on {when} between:\n\n",
        "THIS AGREEMENT OF TENANCY is executed at {city} on the {when}, BY AND BETWEEN:\n\n",
    ]), city=Ent(loc["city"], "ADDRESS"), when=Ent(fmt_date(executed), "EXECUTION_DATE"))
    first, second = ("LANDLORD", landlord), ("TENANT", tenant)
    parties(b, ("LANDLORD", "Landlord", landlord), ("TENANT", "Tenant", tenant))
    if rng.random() < 0.5:
        b.t(f"This Agreement is governed by the laws of {loc['state']}.\n\n")
    b.emit(b.pick("rent.recital", [
        "WHEREAS the Landlord is the absolute owner of the residential premises situated at {addr} "
        "(hereinafter \"the Premises\"), and has agreed to let out the same to the Tenant on the following terms:\n\n",
        "WHEREAS the Landlord owns the residential flat bearing {addr} (hereinafter \"the Premises\") and the "
        "Tenant has requested the Landlord to let the Premises for residential use;\n\nNOW THIS AGREEMENT "
        "WITNESSETH AS FOLLOWS:\n\n",
        "The Landlord hereby lets, and the Tenant hereby takes on rent, the premises at {addr} "
        "(\"the Premises\") on the terms set out below.\n\n",
    ]), addr=Ent(prop_addr, "PROPERTY_ADDRESS"))

    dur = Ent(vp.format_count(months, "month"), "DURATION")
    plan = [
        lambda: b.clause("LEASE_DURATION", heading_for(b, "rent.duration", ["LEASE DURATION", "DURATION OF AGREEMENT", "PERIOD OF TENANCY", "TERM OF TENANCY"]),
                         b.pick("rent.duration.b", [
                             "This Agreement shall be valid for a period of {dur} commencing from {start} and ending on {end}.",
                             "The tenancy hereby created shall be for a term of {dur} with effect from {start}, and shall expire on {end} unless renewed in writing.",
                             "The Landlord agrees to let and the Tenant agrees to take the Premises for a period of {dur} beginning on {start}.",
                             "The term of this Agreement is {dur}, starting {start} and ending {end}, both days inclusive.",
                         ]), dur=dur, start=Ent(fmt_date(start), "COMMENCEMENT_DATE"),
                         end=Ent(fmt_date(add_months(start, months)), "EXPIRY_DATE")),
        lambda: b.clause("RENT_PAYMENT", heading_for(b, "rent.rent", ["RENT", "RENT PAYMENT", "MONTHLY RENT", "CONSIDERATION"]),
                         b.pick("rent.rent.b", [
                             "The Tenant shall pay to the Landlord a monthly rent of {rent} on or before the {due} day of each English calendar month{mode}.",
                             "Rent for the Premises is fixed at {rent} per month, payable in advance on or before the {due} of every month{mode}.",
                             "The Tenant agrees to pay a sum of {rent} per month towards rent, exclusive of electricity and water charges, by the {due} of each month{mode}.",
                             "A monthly rent of {rent} shall be payable by the Tenant{mode}, in advance, on or before the {due} of each month.",
                             "In consideration of the tenancy, the Tenant shall pay {rent} per month to the Landlord, such payment to reach the Landlord not later than the {due} day of the month{mode}.",
                         ]), rent=money(rent, "RENT", cur), due=vp.ordinal(rng.choice([1, 5, 7, 10])),
                         mode=rng.choice(["", " by bank transfer (NEFT/IMPS) to the Landlord's account",
                                          " through UPI or bank transfer", " by account-payee cheque"])),
        lambda: rental_deposit(b, money(deposit, "SECURITY_DEPOSIT", cur)),
    ]

    optional = []
    if rng.random() < 0.6:
        optional.append(lambda: b.clause("RENT_ESCALATION", heading_for(b, "rent.esc", ["RENT ESCALATION", "ENHANCEMENT OF RENT", "REVISION OF RENT"]),
                                         b.pick("rent.esc.b", [
                                             "The monthly rent shall stand increased by {rate} upon expiry of every {n} months.",
                                             "On renewal of this Agreement, the rent shall be enhanced by {rate} over the last rent paid.",
                                             "The rent payable hereunder shall be revised upward by {rate} every year during the subsistence of this tenancy.",
                                         ]), rate=Ent(rng.choice(["5%", "8%", "10%", "7.5%", "five per cent (5%)", "10 percent"]), "ESCALATION_RATE"),
                                         n=rng.choice([11, 12])))
    if rng.random() < 0.4:
        optional.append(lambda: b.clause("LOCK_IN_PERIOD", heading_for(b, "rent.lock", ["LOCK-IN PERIOD", "LOCK IN"]),
                                         b.pick("rent.lock.b", [
                                             "The parties agree to a lock-in period of {lock} from the commencement of this Agreement, during which neither party shall terminate this Agreement except for breach.",
                                             "Neither the Landlord nor the Tenant shall terminate this Agreement during the first {lock}, save for breach; a party terminating earlier shall pay the other the rent for the unexpired lock-in period.",
                                         ]), lock=Ent(vp.format_count(rng.choice([3, 6, 11, 12]), "month"), "LOCK_IN_PERIOD")))
    if rng.random() < 0.85:
        optional.append(lambda: rental_notice(b))
    if rng.random() < 0.9:
        optional.append(lambda: rental_maintenance(b))
    simple = [
        (0.7, "UTILITIES", "rent.util", ["UTILITIES", "ELECTRICITY AND WATER CHARGES", "OUTGOINGS"], [
            "The Tenant shall pay electricity charges as per the separate meter installed in the Premises, and water charges as billed by the municipal authority, directly to the concerned authorities.",
            f"Electricity and water charges for the period of tenancy shall be borne by the Tenant. Society maintenance charges shall be paid by the {rng.choice(['Landlord', 'Tenant'])}.",
            "The Tenant shall pay all charges for electricity, piped gas and internet consumed in the Premises. Property tax shall continue to be paid by the Landlord.",
        ]),
        (0.6, "USE_OF_PREMISES", "rent.use", ["USE OF PREMISES", "PURPOSE"], [
            "The Premises shall be used by the Tenant solely for residential purposes for the Tenant and the Tenant's family, and shall not be used for any commercial or illegal activity.",
            "The Tenant shall use the Premises only as a private dwelling and shall not carry on any trade or business therefrom.",
            "The Premises are let for residential use only. The Tenant shall not store any hazardous or inflammable material in the Premises.",
        ]),
        (0.6, "SUBLETTING", "rent.sublet", ["SUBLETTING", "NO SUB-LETTING", "ASSIGNMENT"], [
            "The Tenant shall not sublet, assign or part with possession of the Premises or any part thereof without the prior written consent of the Landlord.",
            "The Tenant shall not induct any third party into the Premises, whether as sub-tenant, licensee or paying guest.",
            "Subletting of the whole or any part of the Premises is strictly prohibited.",
        ]),
        (0.4, "ALTERATIONS", "rent.alter", ["ALTERATIONS", "ADDITIONS AND ALTERATIONS"], [
            "The Tenant shall not make any structural additions or alterations to the Premises without the written permission of the Landlord.",
            "No permanent changes, including drilling into load-bearing walls or changes to plumbing, shall be made without the Landlord's prior written consent.",
        ]),
        (0.4, "ENTRY_AND_INSPECTION", "rent.inspect", ["INSPECTION", "RIGHT OF ENTRY"], [
            f"The Landlord or the Landlord's authorised agent may inspect the Premises at reasonable hours after giving {rng.choice([24, 48])} hours' prior intimation to the Tenant.",
            "The Landlord shall be entitled to enter the Premises for inspection or repairs on reasonable notice, at a time convenient to the Tenant.",
        ]),
        (0.5, "STAMP_DUTY_AND_REGISTRATION", "rent.stamp", ["STAMP DUTY AND REGISTRATION", "REGISTRATION CHARGES"], [
            f"The stamp duty and registration charges for this Agreement shall be borne {rng.choice(['equally by both parties', 'by the Tenant', 'by the Landlord'])}.",
            f"This Agreement shall be registered with the Sub-Registrar of Assurances at {loc['city']}, and the expenses thereof shall be shared equally by the parties.",
        ]),
        (0.25, "INDEMNITY", "rent.indemnity", ["INDEMNITY"], [
            "The Tenant shall indemnify the Landlord against any loss or claim arising from the Tenant's use of the Premises in breach of this Agreement.",
            "Each party shall indemnify the other against losses caused by its own breach of the terms of this Agreement.",
        ]),
        (0.15, "FORCE_MAJEURE", "rent.fm", ["FORCE MAJEURE"], [
            "Neither party shall be liable for failure to perform its obligations due to fire, flood, earthquake, epidemic or any act of God beyond its control.",
            "If the Premises become uninhabitable due to any natural calamity not caused by the Tenant, the rent shall abate until the Premises are restored.",
        ]),
    ]
    if loc["state"] in {"Maharashtra", "Delhi", "Karnataka", "Uttar Pradesh"}:
        simple.append((0.5, "POLICE_VERIFICATION", "rent.police", ["POLICE VERIFICATION"], [
            "The Tenant shall furnish copies of identity proof and photographs for police verification, and the Landlord shall submit the tenant verification form to the local police station.",
            f"The parties shall complete tenant verification with the jurisdictional police station within {rng.choice([15, 30])} days of execution of this Agreement.",
        ]))
    optional += simple_clauses(b, simple)
    rng.shuffle(optional)

    closing = [
        lambda: b.clause("TERMINATION", heading_for(b, "rent.term", ["TERMINATION", "TERMINATION AND DEFAULT", "DETERMINATION OF TENANCY"]),
                         b.pick("rent.term.b", [
                             "The Landlord may terminate this Agreement forthwith in the event of non-payment of rent for two consecutive months.",
                             "In case of breach of any material term of this Agreement, the aggrieved party may terminate the Agreement after serving due notice.",
                             f"If the Tenant commits breach of any of the terms herein, the Landlord may terminate this Agreement after serving a notice of breach and giving the Tenant {rng.choice([15, 30])} days to remedy the same.",
                             "Upon expiry or earlier termination of this Agreement, the Tenant shall hand over vacant and peaceful possession of the Premises to the Landlord in the same condition, normal wear and tear excepted.",
                         ])),
    ]
    if rng.random() < 0.8:
        closing.append(lambda: dispute(b, "rent", loc))
    closing.append(lambda: jurisdiction(b, "rent", loc))

    included = run_plan(b, plan + optional + closing)
    omitted = sorted({"RENT_ESCALATION", "LOCK_IN_PERIOD", "NOTICE_PERIOD", "MAINTENANCE", "UTILITIES",
                      "USE_OF_PREMISES", "SUBLETTING", "ALTERATIONS", "ENTRY_AND_INSPECTION",
                      "STAMP_DUTY_AND_REGISTRATION", "INDEMNITY", "FORCE_MAJEURE", "DISPUTE_RESOLUTION"} - included)

    b.t("\n")
    signatures(b, first, second, "Agreement")
    if rng.random() < 0.3:
        b.t("\nANNEXURE I - FIXTURES AND FITTINGS\n")
        items = rng.sample(["Ceiling fans", "Tube lights", "Geyser", "Wardrobes", "Modular kitchen with chimney",
                            "Air conditioners", "Water purifier", "Curtain rods"], 4)
        for i, item in enumerate(items, 1):
            b.t(f"{i}. {item}: {rng.randint(1, 5)}\n")

    return b.doc, finish(b, loc, cur, omitted)


def rental_deposit(b: DocBuilder, dep: Ent) -> None:
    heading = heading_for(b, "rent.dep", ["SECURITY DEPOSIT", "DEPOSIT", "INTEREST FREE DEPOSIT", "REFUNDABLE AMOUNT"])
    if rng.random() < RISK_RATE:
        b.risk("UNBOUNDED_DISCRETION", "SECURITY_DEPOSIT")
        body = b.pick("rent.dep.unfair", [
            "The Tenant has paid a security deposit of {dep}. At the end of the tenancy the Landlord may retain such portion of the deposit as the Landlord, in the Landlord's sole judgement, considers necessary, and the Tenant shall not question the amount so retained.",
            "A security deposit of {dep} is payable by the Tenant. The Landlord shall be entitled to adjust or forfeit the whole or any part of the deposit for any reason the Landlord deems fit, without being required to furnish any account.",
            "The Tenant shall deposit {dep} as security. Refund of the deposit, and the quantum of any deductions therefrom, shall be entirely at the discretion of the Landlord.",
        ])
    else:
        body = b.pick("rent.dep.fair", [
            "The Tenant has paid to the Landlord an interest-free refundable security deposit of {dep}, which shall be refunded at the time of vacating the Premises after deducting any unpaid rent or charges.",
            "A refundable security deposit of {dep} has been paid by the Tenant, receipt of which the Landlord hereby acknowledges. The deposit shall be returned without interest within {days} days of the Tenant handing over vacant possession, subject to deduction of arrears and the cost of repairing damage beyond normal wear and tear.",
            "The Tenant shall keep with the Landlord a sum of {dep} as security deposit, refundable in full on termination of this Agreement against handover of the Premises in good condition.",
            "Security deposit of {dep} shall be paid at the time of execution of this Agreement and refunded within {days} days of vacating the Premises, less any documented dues.",
        ])
    b.clause("SECURITY_DEPOSIT", heading, body, dep=dep, days=rng.choice([15, 30, 45]))


def notice_value(days_choices, month_choices) -> str:
    if rng.random() < 0.7:
        return f"{rng.choice(days_choices)} days"
    return vp.format_count(rng.choice(month_choices), "month")


def rental_notice(b: DocBuilder) -> None:
    heading = heading_for(b, "rent.notice", ["NOTICE PERIOD", "TERMINATION NOTICE", "NOTICE FOR VACATING"])
    if rng.random() < RISK_RATE:
        long_np, short_np = notice_value([60, 90], [2, 3]), f"{rng.choice([7, 10, 15])} days"
        b.risk("ASYMMETRIC_OBLIGATION", "NOTICE_PERIOD", tenant_notice=long_np, landlord_notice=short_np)
        body = b.pick("rent.notice.unfair", [
            "The Tenant may vacate the Premises only after giving the Landlord {a} written notice, whereas the Landlord may require the Tenant to vacate by giving {b} notice.",
            "The Tenant shall give not less than {a} notice before vacating. The Landlord may terminate this Agreement at any time by giving {b} notice to the Tenant.",
            "For termination by the Tenant, a notice of {a} is mandatory; for termination by the Landlord, a notice of {b} shall suffice.",
        ])
        b.clause("NOTICE_PERIOD", heading, body, a=Ent(long_np, "NOTICE_PERIOD"), b=Ent(short_np, "NOTICE_PERIOD"))
        return
    np = notice_value([15, 30, 45, 60, 90], [1, 2, 3])
    body = b.pick("rent.notice.fair", [
        "Either party may terminate this Agreement by giving {np}{apos} written notice to the other party.",
        "This Agreement may be terminated by either party by serving {np} notice in writing on the other.",
        "Either the Landlord or the Tenant may bring this tenancy to an end by giving not less than {np} prior written notice.",
        "A notice of {np} in writing shall be required from the party intending to terminate this Agreement before the expiry of its term.",
    ])
    b.clause("NOTICE_PERIOD", heading, body, np=Ent(np, "NOTICE_PERIOD"), apos="'" if np.endswith("s") else "'s")


def rental_maintenance(b: DocBuilder) -> None:
    heading = heading_for(b, "rent.maint", ["MAINTENANCE", "REPAIRS AND MAINTENANCE", "UPKEEP OF PREMISES"])
    if rng.random() < RISK_RATE:
        b.risk("LIABILITY_SHIFT", "MAINTENANCE")
        body = b.pick("rent.maint.unfair", [
            "All repairs to the Premises, of whatever nature including structural repairs, seepage, leakage and damage to the roof or walls, shall be carried out by the Tenant at the Tenant's own cost, and the Landlord shall have no liability whatsoever.",
            "The Tenant shall bear the entire cost of maintenance and repair of the Premises including the building structure, plumbing and electrical systems, irrespective of the cause of damage.",
            "The Tenant accepts the Premises in its present condition and shall be solely liable for every repair, major or minor, including those arising from structural defects in the building.",
        ])
    else:
        body = b.pick("rent.maint.fair", [
            "The Tenant shall be responsible for day-to-day maintenance of the Premises, while major and structural repairs shall be carried out by the Landlord at the Landlord's cost.",
            "Minor repairs such as replacement of bulbs, tap washers and fuses shall be done by the Tenant. Structural repairs, seepage and repairs to the main water and electricity lines shall be the responsibility of the Landlord.",
            "The Landlord shall keep the Premises in tenantable repair and shall bear the cost of structural repairs; the Tenant shall keep the interiors clean and in good order, normal wear and tear excepted.",
            "Routine upkeep shall be the Tenant's responsibility; any repair arising from structural defects, ageing of the building or natural causes shall be attended to by the Landlord.",
        ])
    b.clause("MAINTENANCE", heading, body)


# --- land lease ---------------------------------------------------------------

AGRI_LAND_TYPES = ["Agricultural", "Agricultural", "Garden Land", "Dry Land", "Wet Land"]
NON_AGRI_LAND_TYPES = ["Non-Agricultural (NA)", "Commercial", "Industrial (NA)", "Residential Conversion Pending"]
AGRI_USES = ["cultivation of seasonal crops", "horticultural plantation", "dairy farming operations",
             "agricultural storage purposes", "sericulture and mulberry cultivation", "organic vegetable farming"]
NON_AGRI_USES = ["construction of a warehouse facility", "commercial retail development",
                 "industrial processing operations", "running a brick kiln", "construction of a resort"]


def build_land_lease(doc_id: str, split: str, heading_style: str) -> tuple[BuiltDocument, DocBuilder]:
    b = DocBuilder(doc_id, "land_lease", split, heading_style)
    loc = vp.random_location()
    info = loc["info"]
    lessor = vp.random_company() if rng.random() < 0.1 else vp.random_person()
    lessee = vp.random_company() if rng.random() < 0.35 else vp.random_person()
    cur = vp.pick_currency_style()
    date_style = rng.randrange(vp.DATE_STYLES)
    fmt_date = lambda dt: vp.format_date(dt.day, dt.month, dt.year, date_style)  # noqa: E731

    survey_prefix, survey_kind = rng.choice(info["survey_formats"])
    survey_no = vp.random_survey_number(survey_kind)
    khata_no = str(rng.randint(10, 4999)) if info["khata"] and rng.random() < 0.7 else None
    area = vp.random_land_area(rng.choice(info["area_units"]))
    is_agri = rng.random() < 0.7
    land_type = rng.choice(AGRI_LAND_TYPES if is_agri else NON_AGRI_LAND_TYPES)
    contradiction = is_agri and rng.random() < RISK_RATE
    permitted_use = rng.choice(NON_AGRI_USES if (contradiction or not is_agri) else AGRI_USES)
    if contradiction:
        b.risk("LAND_USE_CONTRADICTION", "LAND_USE_RESTRICTION", land_use_type=land_type, permitted_use=permitted_use)

    d, m, y = vp.random_date()
    executed = date(y, m, d)
    start = executed + timedelta(days=rng.choice([0, 1, 15, 30]))
    years = rng.choice([3, 5, 10, 11, 15, 20, 30])
    annual_rent = rng.randrange(20000, 600000, 1000)
    premium = rng.randrange(100000, 5000000, 10000)

    b.t(b.pick("land.title", ["LAND LEASE DEED", "DEED OF LEASE", "LEASE DEED", "INDENTURE OF LEASE"]) + "\n\n")
    b.emit(b.pick("land.exec", [
        "This Deed of Lease is executed at {city} on this {when} between:\n\n",
        "This Lease Deed is made at {city} on {when}, BY AND BETWEEN:\n\n",
        "THIS INDENTURE OF LEASE is executed at {city} on the {when} between:\n\n",
    ]), city=Ent(loc["city"], "ADDRESS"), when=Ent(fmt_date(executed), "EXECUTION_DATE"))
    first, second = ("LESSOR", lessor), ("LESSEE", lessee)
    parties(b, ("LESSOR", "Lessor", lessor), ("LESSEE", "Lessee", lessee))
    if rng.random() < 0.5:
        b.t(f"This Deed is governed by the laws of {loc['state']}.\n\n")

    survey = Ent(survey_no, "SURVEY_NUMBER")
    khata_part = Ent(khata_no, "KHATA_NUMBER") if khata_no else None
    recital = b.pick("land.recital", [
        "WHEREAS the Lessor is the absolute owner of the land bearing {sp} {survey}{kh}, admeasuring {area}, classified as {ltype} land, and has agreed to lease the same to the Lessee on the following terms:\n\n",
        "WHEREAS the Lessor is the absolute owner and in peaceful possession of the land bearing {sp} {survey}{kh}, admeasuring {area}, situated at Village {village}, Taluka {taluka}, District {district}, classified as {ltype} land as per the {record}, more particularly described in the Schedule hereunder (\"the said Land\");\n\nNOW THIS DEED WITNESSETH AS FOLLOWS:\n\n",
        "WHEREAS the land bearing {sp} {survey}{kh} at Village {village}, District {district}, admeasuring {area}, is recorded as {ltype} in the {record}, and the Lessor has agreed to grant a lease thereof to the Lessee;\n\nNOW THEREFORE the parties agree as follows:\n\n",
    ])
    b.emit(recital.replace("{kh}", ", Khata No. {kh}" if khata_part else ""),
           sp=survey_prefix, survey=survey, kh=khata_part, area=Ent(area, "LAND_AREA"),
           ltype=Ent(land_type, "LAND_USE_TYPE"), village=loc["village"], taluka=loc["taluka"],
           district=loc["district"], record=info["record"])

    plan = [
        lambda: b.clause("LEASE_DURATION", heading_for(b, "land.duration", ["LEASE DURATION", "DURATION OF LEASE", "TERM OF LEASE"]),
                         b.pick("land.duration.b", [
                             "This Lease shall remain in force for a period of {dur} from {start}.",
                             "The lease hereby granted shall be for a term of {dur} commencing on {start} and expiring on {end}.",
                             "The Lessor hereby demises the said Land to the Lessee for a period of {dur} with effect from {start}.",
                         ]), dur=Ent(vp.format_count(years, "year"), "DURATION"),
                         start=Ent(fmt_date(start), "COMMENCEMENT_DATE"),
                         end=Ent(fmt_date(add_months(start, years * 12)), "EXPIRY_DATE")),
    ]
    if rng.random() < 0.65:
        plan.append(lambda: b.clause("LEASE_PREMIUM", heading_for(b, "land.prem", ["LEASE PREMIUM", "PREMIUM", "ONE-TIME CONSIDERATION"]),
                                     b.pick("land.prem.b", [
                                         "The Lessee shall pay a one-time lease premium of {prem} to the Lessor upon execution of this Deed.",
                                         "An upfront lease premium amounting to {prem} shall be payable by the Lessee prior to handover of possession of the land.",
                                         "The Lessee has paid a non-refundable premium of {prem} to the Lessor, the receipt whereof the Lessor hereby admits.",
                                     ]), prem=money(premium, "LEASE_PREMIUM", cur)))
    plan.append(lambda: b.clause("RENT_PAYMENT", heading_for(b, "land.rent", ["ANNUAL LEASE RENT", "LEASE RENT", "RENT", "CONSIDERATION"]),
                                 b.pick("land.rent.b", [
                                     "The Lessee shall pay an annual lease rent of {rent} payable on or before {month} each year.",
                                     "Annual rent of {rent} for the leased land shall be paid by the Lessee to the Lessor on or before {month} of every calendar year.",
                                     "The Lessee shall pay a yearly rent of {rent} in two equal half-yearly instalments, the first falling due in {month}.",
                                     "The rent reserved by this Deed is {rent} per annum, payable in advance by the Lessee by the end of {month} every year.",
                                 ]), rent=money(annual_rent, "RENT", cur), month=rng.choice(vp.MONTHS)))
    if rng.random() < 0.5:
        plan.append(lambda: b.clause("RENT_ESCALATION", heading_for(b, "land.esc", ["RENT ESCALATION", "ENHANCEMENT OF RENT"]),
                                     b.pick("land.esc.b", [
                                         "The annual lease rent shall be enhanced by {rate} after every {n} years of the lease term.",
                                         "The rent shall stand revised by {rate} upon completion of every {n} years.",
                                     ]), rate=Ent(rng.choice(["5%", "10%", "15%", "ten per cent (10%)"]), "ESCALATION_RATE"),
                                     n=rng.choice([2, 3, 5])))
    plan.append(lambda: b.clause("LAND_USE_RESTRICTION", heading_for(b, "land.use", ["PERMITTED USE", "LAND USE", "USE OF LAND", "PURPOSE OF LEASE"]),
                                 b.pick("land.use.b", [
                                     "The Lessee shall use the leased land solely for the purpose of {use} and for no other purpose without prior written consent.",
                                     "The land hereby leased shall be utilised exclusively for {use}; any change in use shall require the Lessor's written approval.",
                                     "The said Land is leased for {use}, and the Lessee shall not put it to any other use during the term.",
                                 ]), use=Ent(permitted_use, "LAND_USE_RESTRICTION")))

    optional = []
    if land_type in AGRI_LAND_TYPES and rng.random() < 0.65:
        optional.append(("CROP_OR_CULTIVATION_RIGHTS", "land.crop", ["CROP RIGHTS", "CULTIVATION RIGHTS", "RIGHTS TO PRODUCE"], [
            "The Lessee shall be entitled to all crops raised and harvested on the said Land during the term. Existing fruit-bearing trees shall remain the property of the Lessor.",
            "The Lessee may cultivate any lawful crop on the said Land and shall be entitled to the entire produce thereof.",
            "All standing crops at the expiry of the lease may be harvested by the Lessee within 60 days thereafter.",
        ], {}))
    if rng.random() < 0.4:
        optional.append(("WATER_RIGHTS", "land.water", ["WATER RIGHTS", "IRRIGATION"], [
            "The Lessee shall be entitled to draw water from the existing borewell on the said Land for irrigation purposes.",
            "The Lessee may use the canal water allotted to the said Land, subject to payment of irrigation charges to the authorities.",
        ], {}))
    if rng.random() < 0.45:
        optional.append(("IMPROVEMENTS_AND_STRUCTURES", "land.improve", ["STRUCTURES AND IMPROVEMENTS", "CONSTRUCTION"], [
            "The Lessee may erect temporary sheds and fencing on the said Land. On expiry of the lease, the Lessee shall remove the same at the Lessee's cost.",
            "Any permanent structure erected by the Lessee shall vest in the Lessor on expiry of the lease without payment of compensation.",
            "The Lessee shall not construct any permanent structure without the prior written consent of the Lessor and the approval of the competent authority.",
        ], {}))
    if rng.random() < 0.6:
        optional.append(("REVENUE_AND_TAXES", "land.tax", ["LAND REVENUE AND TAXES", "RATES AND TAXES"], [
            "Land revenue and all cesses payable in respect of the said Land shall be paid by the Lessor.",
            "During the term of the lease, the Lessee shall pay all taxes, cesses and charges levied on the said Land.",
        ], {}))
    if rng.random() < 0.85:
        optional.append(("ENCUMBRANCE_DECLARATION", "land.enc", ["ENCUMBRANCE DECLARATION", "TITLE AND ENCUMBRANCES", "LESSOR'S COVENANTS"], [
            "The Lessor hereby declares that the said land bearing {sp} {survey} is free from all encumbrances, charges, and liens.",
            "The Lessor confirms that the land described herein, {sp} {survey}, is unencumbered and free from any third-party claims.",
            "The Lessor covenants that the Lessor has a clear and marketable title to {sp} {survey} and that no mortgage, lien or litigation is pending in respect thereof.",
        ], {"sp": survey_prefix, "survey": survey}))
    if rng.random() < 0.3:
        optional.append(("EASEMENT", "land.ease", ["EASEMENT", "RIGHT OF WAY"], [
            "The Lessee shall have a {ease} over the cart track passing through the adjoining land for access to the said Land.",
            "The Lessor grants the Lessee the {ease} along the eastern boundary for movement of vehicles and farm equipment.",
        ], {"ease": Ent("right of way", "EASEMENT_RIGHT")}))
    if rng.random() < 0.4:
        optional.append(("SUB_LEASE", "land.sublease", ["SUB-LEASE", "ASSIGNMENT AND SUB-LEASE"], [
            "The Lessee shall not sub-lease or assign the said Land or any part thereof without the prior written consent of the Lessor.",
            "The Lessee may sub-lease the said Land for agricultural purposes only, after informing the Lessor in writing.",
        ], {}))
    if rng.random() < 0.4:
        optional.append(("RENEWAL", "land.renew", ["RENEWAL", "OPTION TO RENEW"], [
            "The lease may be renewed for a further period on mutually agreed terms, provided the Lessee gives a written request at least six months before expiry.",
            "On expiry, the Lessee shall have the first right to renew this lease at the rent then prevailing in the locality.",
        ], {}))
    if rng.random() < 0.25:
        optional.append(("COMPENSATION_ON_ACQUISITION", "land.acq", ["COMPENSATION ON ACQUISITION", "ACQUISITION"], [
            "If the said Land or any part thereof is acquired by the Government, the compensation for the land shall belong to the Lessor, and compensation for standing crops and structures shall belong to the Lessee.",
            "In the event of compulsory acquisition, this lease shall stand determined as to the acquired portion and the rent shall abate proportionately.",
        ], {}))
    optional_fns = simple_clauses(b, [(1.0, *o) for o in optional])
    if rng.random() < 0.35:
        optional_fns.append(lambda: land_notice(b))
    rng.shuffle(optional_fns)

    closing = [
        lambda: b.clause("TERMINATION", heading_for(b, "land.term", ["TERMINATION", "TERMINATION AND FORFEITURE", "DETERMINATION OF LEASE"]),
                         b.pick("land.term.b", [
                             "The Lessor may terminate this lease if the Lessee fails to pay the annual lease rent for two consecutive years.",
                             "If the Lessee uses the said Land for any purpose other than the permitted use, the Lessor may determine this lease after giving the Lessee an opportunity to remedy the breach.",
                             "In case of breach of any material term of this Deed, the aggrieved party may terminate the lease after serving due notice on the other party.",
                             "Upon expiry or earlier determination of this lease, the Lessee shall restore vacant possession of the said Land to the Lessor.",
                         ])),
    ]
    if rng.random() < 0.75:
        closing.append(lambda: dispute(b, "land", loc))
    closing.append(lambda: jurisdiction(b, "land", loc))

    included = run_plan(b, plan + optional_fns + closing)
    omitted = sorted({"LEASE_PREMIUM", "RENT_ESCALATION", "CROP_OR_CULTIVATION_RIGHTS", "WATER_RIGHTS",
                      "IMPROVEMENTS_AND_STRUCTURES", "REVENUE_AND_TAXES", "ENCUMBRANCE_DECLARATION", "EASEMENT",
                      "SUB_LEASE", "RENEWAL", "COMPENSATION_ON_ACQUISITION", "NOTICE_PERIOD",
                      "DISPUTE_RESOLUTION"} - included)

    if rng.random() < 0.85:
        b.t("\nSCHEDULE OF THE PROPERTY\n")
        b.emit("All that piece and parcel of land bearing {sp} {survey}" + (", Khata No. {kh}" if khata_part else "") +
               ", admeasuring {area}, situated at Village {village}, Taluka {taluka}, District {district}, "
               "{state}, and bounded as follows:\n",
               sp=survey_prefix, survey=Ent(survey_no, "SURVEY_NUMBER"), kh=khata_part, area=Ent(area, "LAND_AREA"),
               village=loc["village"], taluka=loc["taluka"], district=loc["district"], state=loc["state"])
        # Neighbouring survey numbers are deliberately unlabeled: they are
        # survey numbers, but not the leased land's - hard negatives.
        neighbour = lambda: f"land bearing {survey_prefix} {vp.random_survey_number(survey_kind)}"  # noqa: E731
        sides = [("North", neighbour()), ("South", rng.choice(["village road", "nala", neighbour()])),
                 ("East", f"land of {vp.random_person()['name']}"), ("West", rng.choice(["canal", "cart track", neighbour()]))]
        for side, what in sides:
            b.t(f"On or towards the {side}: {what}\n")

    b.t("\n")
    signatures(b, first, second, "Deed")
    return b.doc, finish(b, loc, cur, omitted, land_use_type=land_type, permitted_use=permitted_use)


def land_notice(b: DocBuilder) -> None:
    heading = heading_for(b, "land.notice", ["NOTICE PERIOD", "NOTICE OF TERMINATION"])
    if rng.random() < RISK_RATE:
        long_np, short_np = vp.format_count(rng.choice([6, 12]), "month"), f"{rng.choice([15, 30])} days"
        b.risk("ASYMMETRIC_OBLIGATION", "NOTICE_PERIOD", lessee_notice=long_np, lessor_notice=short_np)
        body = b.pick("land.notice.unfair", [
            "The Lessee may surrender the lease only after giving {a} written notice to the Lessor, while the Lessor may determine the lease by giving {b} notice to the Lessee.",
            "A notice of {a} shall be given by the Lessee for early surrender; the Lessor may resume the said Land on {b} notice.",
        ])
        b.clause("NOTICE_PERIOD", heading, body, a=Ent(long_np, "NOTICE_PERIOD"), b=Ent(short_np, "NOTICE_PERIOD"))
        return
    np = vp.format_count(rng.choice([3, 6]), "month") if rng.random() < 0.6 else f"{rng.choice([90, 180])} days"
    body = b.pick("land.notice.fair", [
        "Either party may terminate this lease by giving {np} written notice to the other.",
        "Neither party shall determine this lease before expiry except by giving the other not less than {np} notice in writing.",
    ])
    b.clause("NOTICE_PERIOD", heading, body, np=Ent(np, "NOTICE_PERIOD"))


# --- shared clause helpers ---------------------------------------------------

def simple_clauses(b: DocBuilder, specs) -> list:
    """specs: (probability, clause_type, key, headings, bodies[, values])."""
    out = []
    for spec in specs:
        prob, clause_type, key, headings, bodies = spec[:5]
        values = spec[5] if len(spec) > 5 else {}
        if rng.random() < prob:
            out.append(lambda ct=clause_type, k=key, h=headings, bs=bodies, v=values:
                       b.clause(ct, heading_for(b, k, h), b.pick(f"{k}.b", bs), **v))
    return out


def dispute(b: DocBuilder, key: str, loc: dict) -> None:
    deed = "Deed" if key == "land" else "Agreement"
    b.clause("DISPUTE_RESOLUTION", heading_for(b, f"{key}.dispute", ["DISPUTE RESOLUTION", "SETTLEMENT OF DISPUTES", "ARBITRATION"]),
             b.pick(f"{key}.dispute.b", [
                 "Any dispute arising out of this {deed} shall be referred to arbitration under the Arbitration and Conciliation Act, 1996.",
                 "All disputes shall first be attempted to be resolved amicably, failing which the matter shall be referred to a sole arbitrator, and the seat of arbitration shall be {city}.",
                 "The parties shall attempt to settle any dispute through mutual discussion within 30 days, failing which either party may approach the competent court.",
             ]), city=loc["city"], deed=deed)


def jurisdiction(b: DocBuilder, key: str, loc: dict) -> None:
    deed = "Deed" if key == "land" else "Agreement"
    b.clause("JURISDICTION", heading_for(b, f"{key}.juris", ["JURISDICTION", "GOVERNING LAW AND JURISDICTION", "GOVERNING LAW"]),
             b.pick(f"{key}.juris.b", [
                 "This {deed} shall be governed by the laws of India, and the courts at {city} alone shall have jurisdiction.",
                 "The courts at {city} shall have exclusive jurisdiction over any matter arising from this {deed}.",
                 "This {deed} shall be governed by the laws of India and the laws of {state}, and shall be subject to the jurisdiction of the competent courts at {city}, with appeals lying before the {hc}.",
             ]), city=loc["city"], state=loc["state"], hc=loc["high_court"], deed=deed)


def run_plan(b: DocBuilder, plan: list) -> set[str]:
    for render in plan:
        render()
    return {c.label for c in b.doc.clauses}


def finish(b: DocBuilder, loc: dict, cur, omitted: list[str], **extra) -> DocBuilder:
    b.doc.metadata = {
        "document_type": b.doc.document_type,
        "is_synthetic": True,
        "schema_version": "2.0",
        "generator_version": GENERATOR_VERSION,
        "split": b.split,
        "city": loc["city"],
        "state": loc["state"],
        "heading_style": b.heading_style,
        "currency_style": cur[0],
        "injected_risks": b.injected_risks,
        "omitted_clauses": omitted,
        "templates": b.templates,
        "heldout_templates": b.heldout_templates,
        **extra,
    }
    return b


# --- validation -------------------------------------------------------------

ROLE_WORDS = {
    "residential_rental": re.compile(r"\b(lessor|lessee)\b", re.I),
    "land_lease": re.compile(r"\b(landlord|tenant)\b", re.I),
}


def validate(doc: BuiltDocument) -> list[str]:
    """Everything that must hold for a document to be written. Returns
    problems (empty = valid); generate_batch_v2.py aborts on any."""
    problems = []
    if not verify_offsets(doc):
        problems.append("entity/clause offsets do not match text")
    ents = sorted(doc.entities, key=lambda e: e.start)
    for a, b in zip(ents, ents[1:]):
        if b.start < a.end:
            problems.append(f"overlapping entities {a.label}:{a.text!r} / {b.label}:{b.text!r}")
    for a, b in zip(doc.clauses, doc.clauses[1:]):
        if b.start < a.end:
            problems.append(f"overlapping clauses {a.label}/{b.label}")
    if m := ROLE_WORDS[doc.document_type].search(doc.text):
        problems.append(f"wrong-domain party term {m.group(0)!r} in a {doc.document_type}")
    city, state = doc.metadata["city"], doc.metadata["state"]
    if city not in {c[0] for c in vp.STATES[state]["cities"]}:
        problems.append(f"city {city} is not in {state}")
    if "{" in doc.text or "}" in doc.text:
        problems.append("unrendered template placeholder")
    return problems
