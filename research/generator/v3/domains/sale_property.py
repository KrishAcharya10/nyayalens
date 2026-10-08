"""sale_property: agreements to sell and sale deeds (flats, plots, land)."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import (dispute_clause, execution_line, joint_party_block, jurisdiction_clause, later_date,
                      party_block, person_or_company, random_dates, signatures, stamp_paper_line, title)
from ..core import DocBuilder, Ent, area, date_ent, ident, money, party, textual

DOMAIN = "sale_property"
DOCUMENT_TYPES = [("AGREEMENT_TO_SELL", 0.55), ("SALE_DEED", 0.45)]
REQUIRED_LABELS = ["SELLER", "BUYER", "PROPERTY", "SALE_CONSIDERATION", "PROPERTY_ADDRESS"]

# adversarial kind -> consistency category it must produce
ADVERSARIAL = {
    "SALE_CONSIDERATION_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "PROPERTY_AREA_CONTRADICTION": "PROPERTY_AREA_CONTRADICTION",
    "PROPERTY_IDENTIFIER_CONTRADICTION": "PROPERTY_IDENTIFIER_CONTRADICTION",
    "POSSESSION_DATE_CONTRADICTION": "DATE_CONTRADICTION",
    "PAYMENT_TOTAL_MISMATCH": "PAYMENT_TOTAL_MISMATCH",
    "PARTY_ROLE_REVERSAL": "PARTY_ROLE_INCONSISTENCY",
}

# adversarial kind -> the document type it needs (others work with any)
REQUIRES = {"PARTY_ROLE_REVERSAL": "AGREEMENT_TO_SELL"}

# counterfactual name -> function producing the changed value from the original
COUNTERFACTUALS = {
    "consideration": lambda v: v + rng.choice([5, 10, 15]) * 100_000,
    "possession_days": lambda v: v + rng.choice([30, 45, 60]),
    "area_value": lambda v: round(v * rng.choice([1.08, 1.12, 0.9])) if isinstance(v, int) else round(v * 1.1, 2),
}

# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"consideration": {"SALE_CONSIDERATION", "ADVANCE_AMOUNT", "BALANCE_AMOUNT", "STAMP_DUTY", "REGISTRATION_FEE", "LOAN"}, "possession_days": {"POSSESSION_DATE", "REGISTRATION_DATE"}, "area_value": {"CARPET_AREA", "LAND_AREA", "BUILT_UP_AREA"}}
QUESTION_LABELS = ["SELLER", "BUYER", "SALE_CONSIDERATION", "ADVANCE_AMOUNT", "BALANCE_AMOUNT", "PROPERTY",
                   "CARPET_AREA", "LAND_AREA", "POSSESSION_DATE", "SURVEY_NUMBER", "FLAT_NUMBER",
                   "PROPERTY_ADDRESS", "STAMP_DUTY", "BANK", "JURISDICTION"]


def build(b: DocBuilder) -> dict:
    is_agreement = b.document_type == "AGREEMENT_TO_SELL"
    deed_word = "Agreement" if is_agreement else "Deed"
    loc = vp.random_location()
    info = loc["info"]
    kind = rng.choices(["flat", "plot", "land"], [0.6, 0.25, 0.15])[0]
    seller = person_or_company(0.12)
    buyers = [vp.random_person()]
    if b.difficulty == "HARD" and b.chance(0.45):
        buyers.append(vp.random_person())
    seller_term = b.term("Seller", ["Vendor", "Transferor"])
    buyer_term = b.term("Buyer", ["Purchaser", "Transferee"])
    ST, BT = seller_term, buyer_term

    executed = random_dates(b)
    consideration = b.val("consideration", lambda: {
        "flat": rng.randrange(2_500_000, 20_000_000, 50_000),
        "plot": rng.randrange(1_000_000, 15_000_000, 50_000),
        "land": rng.randrange(500_000, 8_000_000, 10_000)}[kind])
    advance_pct = rng.choice([0.05, 0.1, 0.1, 0.15, 0.2, 0.25])
    advance = int(round(consideration * advance_pct, -4))
    balance = consideration - advance
    possession_days = b.val("possession_days", lambda: rng.randint(45, 240) if is_agreement else 0)
    possession = executed + timedelta(days=possession_days)
    registration_by = executed + timedelta(days=max(30, possession_days - rng.randint(0, 20)))
    stamp_duty = int(round(consideration * rng.choice([0.05, 0.06, 0.07]), -2))
    reg_fee = min(int(round(consideration * 0.01, -2)), 30_000)

    survey_prefix, survey_kind = rng.choice(info["survey_formats"])
    survey_no = vp.random_survey_number(survey_kind)
    flat_no = f"{rng.randint(1, 22)}{rng.randint(0, 1)}{rng.randint(1, 8)}"
    plot_no = str(rng.randint(1, 450))
    cts_no = f"{rng.randint(100, 9999)}/{rng.randint(1, 30)}"
    khata_no = str(rng.randint(10, 4999)) if info["khata"] else None
    if kind == "flat":
        area_label, area_unit = "CARPET_AREA", "sq. ft."
        area_value = b.val("area_value", lambda: rng.randrange(380, 2200, 5))
    elif kind == "plot":
        area_label, area_unit = "LAND_AREA", rng.choice(["sq. ft.", "sq. mtrs."])
        area_value = b.val("area_value", lambda: rng.randrange(600, 6000, 10))
    else:
        area_unit = rng.choice(info["area_units"])
        area_label = "LAND_AREA"
        area_value = b.val("area_value", lambda: round(rng.uniform(0.5, 9), 2) if area_unit in ("acres", "hectares")
                           else rng.randint(5, 40))
    built_up = int(area_value * rng.uniform(1.15, 1.3)) if kind == "flat" and b.chance(0.5) else None
    mortgaged = b.chance(0.3)
    bank = rng.choice(["HDFC Bank Limited", "State Bank of India", "ICICI Bank Limited", "Axis Bank Limited",
                       "Bank of Baroda", "LIC Housing Finance Limited"])
    loan = int(round(consideration * rng.uniform(0.2, 0.6), -4))
    poa = vp.random_person() if not seller["is_company"] and b.chance(0.12) else None
    building = f"{rng.choice(vp.VILLAGE_ROOTS)} {rng.choice(['Residency', 'Heights', 'Enclave', 'Apartments', 'Towers'])}"
    if kind == "flat":
        prop_addr = vp.random_property_address(loc)
    elif kind == "plot":
        prop_addr = f"{rng.choice(['Layout', 'Nagar', 'Colony'])} of {loc['locality']}, {loc['city']} - {loc['pin']}"
    else:
        prop_addr = f"Village {loc['village']}, Taluka {loc['taluka']}, District {loc['district']}, {loc['state']}"
    property_text = {"flat": "residential flat", "plot": "residential plot of land", "land": "agricultural land"}[kind]

    # Adversarial / control: every alternative value is drawn whether or
    # not it is used, so a document and its control stay identical
    # everywhere else.
    alt_consideration = consideration + rng.choice([2, 5, 10]) * 100_000
    alt_area = (area_value + rng.choice([25, 40, 60])) if isinstance(area_value, int) else round(area_value + 0.5, 2)
    alt_survey = vp.random_survey_number(survey_kind)
    alt_flat = str(int(flat_no) + rng.choice([1, 2, 100]))
    alt_possession = possession + timedelta(days=rng.choice([30, 45, 90]))
    wrong_balance = balance - rng.choice([1, 2, 5]) * 100_000
    restate = b.chance(b.profile["restate"])
    unfair_default = b.chance(0.15)
    missing = rng.choice(["ENCUMBRANCE", "DEFAULT", "JURISDICTION", None, None, None, None, None])

    def active(kind_name: str) -> bool:
        return b.inject == kind_name and b.inject_active

    def involved(kind_name: str) -> bool:
        return b.inject == kind_name

    if b.inject in ADVERSARIAL:
        missing = None  # keep adversarial/control documents focused on one injected issue

    # --- preamble ----------------------------------------------------------
    title(b, "sale", ["AGREEMENT TO SELL", "AGREEMENT FOR SALE", "MEMORANDUM OF AGREEMENT FOR SALE"]
          if is_agreement else ["SALE DEED", "DEED OF ABSOLUTE SALE", "DEED OF SALE", "CONVEYANCE DEED"])
    stamp_paper_line(b)
    execution_line(b, "sale", loc, executed, "AGREEMENT_DATE", deed_word)
    fmt = "short" if b.chance(0.25 if b.difficulty != "HARD" else 0.05) else "long"
    party_block(b, "SELLER", "seller", ST, seller, fmt, "ONE")
    b.t(";\n\nAND\n\n" if fmt == "long" else ",\n\nAND\n\n")
    if len(buyers) == 1:
        party_block(b, "BUYER", "buyer", BT, buyers[0], fmt, "OTHER")
    else:
        joint_party_block(b, "BUYER", ["buyer", "buyer_2"], BT, buyers, "OTHER")
    b.t(".\n\n")
    if poa:
        b.t(f"The {ST} is represented in this {deed_word} by {poa['honorific']} ")
        b.e(party(poa["name"], "POWER_OF_ATTORNEY", "poa"))
        b.t(", the constituted attorney of the " + ST + " under a registered General Power of Attorney.\n\n")
        b.relation("AUTHORISED_BY", "seller", "poa")

    prop = textual(property_text, "PROPERTY", "property")
    title_text = rng.choice([
        f"a registered Sale Deed bearing Document No. {rng.randint(1000, 9999)} of {executed.year - rng.randint(3, 25)}",
        "inheritance from the late father of the " + ST,
        f"a Gift Deed registered as Document No. {rng.randint(1000, 9999)} of {executed.year - rng.randint(2, 15)}",
        f"allotment by the {rng.choice(vp.VILLAGE_ROOTS)} Co-operative Housing Society",
    ])
    b.emit(b.pick("sale.recital", [
        "WHEREAS the {st} is the absolute owner of the {prop} described in the Schedule hereunder written (\"the said Property\"), having acquired the same by {title};\n\n",
        "WHEREAS the {st} has acquired the {prop} more particularly described in the Schedule below (hereinafter \"the said Property\") by {title}, and is seized and possessed of the same;\n\n",
        "WHEREAS the {st} is lawfully entitled to the {prop} (\"the said Property\") by virtue of {title}, and has agreed to sell the same to the {bt};\n\n",
    ]), st=ST, bt=BT, prop=prop, title=textual(title_text, "TITLE", "title"))
    b.relation("OWNS", "seller", "property")
    b.relation("DERIVES_TITLE_FROM", "seller", "title")
    b.relation("HAS_PROPERTY", "DOCUMENT", "property")
    b.relation("SELLS", "seller", "property")
    for k in ["buyer"] + (["buyer_2"] if len(buyers) > 1 else []):
        b.relation("BUYS", k, "property")
        b.relation("TRANSFERS", "seller", k)
    b.t("NOW THIS " + deed_word.upper() + " WITNESSETH AS FOLLOWS:\n\n")

    # --- property description --------------------------------------------------
    def identifiers_sentence(survey=survey_no, flat=flat_no):
        parts = []
        if kind == "flat":
            parts.append(("Flat No. {flat} on the {floor} floor of the building known as " + building, "FLAT_NUMBER", "flat_no", flat))
            if loc["state"] == "Maharashtra":
                parts.append(("constructed on land bearing CTS No. {cts}", "CTS_NUMBER", "cts_no", cts_no))
        elif kind == "plot":
            parts.append(("Plot No. {plot}", "PLOT_NUMBER", "plot_no", plot_no))
            parts.append((survey_prefix + " {survey}", "SURVEY_NUMBER", "survey_no", survey))
        else:
            parts.append((survey_prefix + " {survey}", "SURVEY_NUMBER", "survey_no", survey))
            if khata_no:
                parts.append(("Khata No. {khata}", "KHATA_NUMBER", "khata_no", khata_no))
        return parts

    def write_identifiers(survey=survey_no, flat=flat_no):
        parts = identifiers_sentence(survey, flat)
        for i, (tpl, label, key, value) in enumerate(parts):
            placeholder = tpl[tpl.index("{") + 1:tpl.index("}")]
            b.emit(tpl, **{placeholder: ident(value, label, key), "floor": vp.ordinal(rng.randint(1, 20))})
            b.t(", " if i < len(parts) - 1 else "")
            if label in ("FLAT_NUMBER", "CTS_NUMBER", "PLOT_NUMBER", "KHATA_NUMBER"):
                b.relation("HAS_IDENTIFIER", "property", key)
            elif label == "SURVEY_NUMBER":
                b.relation("HAS_SURVEY_NUMBER", "property", key)

    with b.clause("PROPERTY_DESCRIPTION", "sale.prop", ["DESCRIPTION OF THE PROPERTY", "THE PROPERTY", "PROPERTY DETAILS", "SUBJECT PREMISES"]):
        b.t(f"The said Property is the {property_text} being ")
        write_identifiers()
        b.emit(", admeasuring {area}", area=area(area_value, area_unit, area_label, "area"))
        b.relation("HAS_AREA", "property", "area")
        if built_up:
            b.emit(" (carpet area), equivalent to {bu} built-up area", bu=area(built_up, "sq. ft.", "BUILT_UP_AREA", "built_up"))
            b.relation("HAS_AREA", "property", "built_up")
        b.emit(", situated at {addr}.", addr=Ent(prop_addr, "PROPERTY_ADDRESS", "prop_addr", {"value": prop_addr.lower()}))
        b.relation("LOCATED_AT", "property", "prop_addr")

    # --- title -----------------------------------------------------------------
    if b.optional(0.5):
        with b.clause("TITLE", "sale.title", ["TITLE", "TITLE OF THE " + ST.upper(), "TITLE DOCUMENTS"]):
            b.ob(b.pick("sale.title.b", [
                "The {st} shall hand over all original title documents relating to the said Property to the {bt} at the time of execution of the sale deed.",
                "The {st} shall produce the originals of all title deeds for inspection by the {bt} or the {bt}'s advocate within fifteen days from today.",
            ]), actor="seller", action="PRODUCE_TITLE_DOCUMENTS", st=ST, bt=BT)

    # --- consideration -----------------------------------------------------------
    with b.clause("CONSIDERATION", "sale.cons", ["CONSIDERATION", "SALE CONSIDERATION", "PRICE", "TOTAL SALE PRICE"]):
        b.emit(b.pick("sale.cons.b", [
            "The total sale consideration for the said Property is agreed at {c}.",
            "The {st} has agreed to sell and the {bt} has agreed to purchase the said Property for a total consideration of {c}.",
            "The price of the said Property, agreed between the parties after negotiation, is {c}, which is its fair market value.",
        ]), c=money(consideration, "SALE_CONSIDERATION", "consideration", b.currency), st=ST, bt=BT)
        b.relation("HAS_CONSIDERATION", "DOCUMENT", "consideration")

    # --- payment ----------------------------------------------------------------
    bal_value = wrong_balance if active("PAYMENT_TOTAL_MISMATCH") else balance
    if is_agreement:
        with b.clause("ADVANCE", "sale.adv", ["ADVANCE", "EARNEST MONEY", "ADVANCE PAYMENT", "TOKEN AMOUNT"]):
            b.ob(b.pick("sale.adv.b", [
                "The {bt} shall pay a sum of {a} to the {st} as advance on the execution of this Agreement.",
                "On signing this Agreement, the {bt} shall pay {a} by RTGS to the {st} as earnest money.",
                "An advance of {a} shall be paid by the {bt} to the {st} upon execution hereof, the receipt of which the {st} shall acknowledge in writing.",
            ]), actor="buyer", action="PAY", amount="advance", purpose="ADVANCE_PAYMENT",
                a=money(advance, "ADVANCE_AMOUNT", "advance", b.currency), st=ST, bt=BT)
            b.relation("HAS_ADVANCE", "DOCUMENT", "advance")
            b.relation("MUST_PAY", "buyer", "advance")
        with b.clause("BALANCE_PAYMENT", "sale.bal", ["BALANCE PAYMENT", "BALANCE CONSIDERATION", "PAYMENT OF BALANCE"]):
            reversal = active("PARTY_ROLE_REVERSAL")
            payer, payee = (ST, BT) if reversal else (BT, ST)
            b.ob(b.pick("sale.bal.b", [
                "The {payer} shall pay the balance consideration of {bal} to the {payee} on or before {due}" + b.cross_ref("ADVANCE", ", after adjusting the advance paid under Clause {n}") + ".",
                "The balance amount of {bal} shall be paid by the {payer} to the {payee} on or before {due}, at the time of registration of the sale deed.",
                "On or before {due}, the {payer} shall pay the remaining {bal} to the {payee} against execution of the sale deed.",
            ]), actor="seller" if reversal else "buyer", action="PAY", amount="balance", deadline="registration_by",
                purpose="BALANCE_PAYMENT", role_reversal=reversal, payer=payer, payee=payee,
                bal=money(bal_value, "BALANCE_AMOUNT", "balance", b.currency),
                due=date_ent(registration_by, "REGISTRATION_DATE", "registration_by", b.date_style))
            b.relation("HAS_BALANCE", "DOCUMENT", "balance")
            b.relation("HAS_REGISTRATION_DATE", "DOCUMENT", "registration_by")
            if not reversal:
                b.relation("MUST_PAY", "buyer", "balance")
        if involved("PARTY_ROLE_REVERSAL"):
            b.expect("PARTY_ROLE_INCONSISTENCY", "sale_balance_payer", ["balance"])
    else:
        with b.clause("PAYMENT_SCHEDULE", "sale.paid", ["MODE OF PAYMENT", "PAYMENT SCHEDULE", "PAYMENT TERMS"]):
            b.emit(b.pick("sale.paid.b", [
                "The {bt} has paid the entire consideration to the {st} as follows: (a) {a} as advance at the time of the agreement to sell; and (b) the balance of {bal} by RTGS on the date of this Deed.",
                "The consideration has been received by the {st} in full: {a} towards advance earlier, and {bal} towards the balance today, the receipt whereof the {st} hereby admits.",
            ]), st=ST, bt=BT, a=money(advance, "ADVANCE_AMOUNT", "advance", b.currency),
                bal=money(bal_value, "BALANCE_AMOUNT", "balance", b.currency))
            b.relation("HAS_ADVANCE", "DOCUMENT", "advance")
            b.relation("HAS_BALANCE", "DOCUMENT", "balance")
    if involved("PAYMENT_TOTAL_MISMATCH"):
        b.expect("PAYMENT_TOTAL_MISMATCH", "sale_payment_total", ["advance", "balance", "consideration"])

    # --- possession -------------------------------------------------------------
    with b.clause("POSSESSION", "sale.poss", ["POSSESSION", "DELIVERY OF POSSESSION", "HANDING OVER OF POSSESSION"]):
        if is_agreement:
            b.ob(b.pick("sale.poss.b", [
                "The {st} shall hand over vacant and peaceful possession of the said Property to the {bt} on or before {pd}.",
                "Vacant possession of the said Property shall be delivered by the {st} to the {bt} not later than {pd}, simultaneously with the payment of the balance consideration.",
                "The {st} shall deliver possession of the said Property, free from occupation, to the {bt} by {pd}.",
            ]), actor="seller", action="DELIVER_POSSESSION", deadline="possession", obj="PROPERTY",
                st=ST, bt=BT, pd=date_ent(possession, "POSSESSION_DATE", "possession", b.date_style))
        else:
            b.emit("The {st} has handed over vacant and peaceful possession of the said Property to the {bt} on {pd}.",
                   st=ST, bt=BT, pd=date_ent(possession, "POSSESSION_DATE", "possession", b.date_style))
        b.relation("HAS_POSSESSION_DATE", "property", "possession")
        if involved("POSSESSION_DATE_CONTRADICTION") or (is_agreement and restate):
            pd2 = alt_possession if active("POSSESSION_DATE_CONTRADICTION") else possession
            b.emit(" The {bt} shall be entitled to occupy the said Property from {pd2} onwards.",
                   bt=BT, pd2=date_ent(pd2, "POSSESSION_DATE", "possession", b.date_style))
    if involved("POSSESSION_DATE_CONTRADICTION"):
        b.expect("DATE_CONTRADICTION", "sale_possession_single", ["possession"])

    # --- sale deed execution (agreement only) --------------------------------------
    if is_agreement and b.optional(0.7):
        with b.clause("TITLE_TRANSFER", "sale.exec", ["EXECUTION OF SALE DEED", "CONVEYANCE", "TRANSFER OF TITLE"]):
            b.ob("The {st} shall execute and present the sale deed for registration in favour of the {bt} upon receipt of the full consideration.",
                 actor="seller", action="EXECUTE_SALE_DEED", st=ST, bt=BT)

    # --- encumbrance -------------------------------------------------------------
    if missing != "ENCUMBRANCE":
        with b.clause("ENCUMBRANCE", "sale.enc", ["ENCUMBRANCES", "FREEDOM FROM ENCUMBRANCES", "MORTGAGE AND LIENS"]):
            if mortgaged:
                b.emit("The said Property is subject to {enc} created in favour of {bank} to secure a home loan with an outstanding amount of {loan}. ",
                       enc=textual("an equitable mortgage", "ENCUMBRANCE", "encumbrance"),
                       bank=Ent(bank, "BANK", "bank", {"value": bank}), loan=money(loan, "LOAN", "loan", b.currency))
                b.relation("ENCUMBERED_BY", "property", "encumbrance")
                b.relation("MORTGAGED_TO", "property", "bank")
                b.ob("The {st} shall clear the said loan and obtain a no-dues certificate from the bank before execution of the sale deed.",
                     actor="seller", action="CLEAR_ENCUMBRANCE", st=ST)
            else:
                b.emit(b.pick("sale.enc.b", [
                    "The {st} declares that the said Property is free from all encumbrances, charges, liens, attachments and litigation.",
                    "The {st} assures the {bt} that the said Property is not subject to any mortgage, charge or third-party claim whatsoever.",
                ]), st=ST, bt=BT)
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="ENCUMBRANCE")

    # --- taxes / stamp duty -----------------------------------------------------------
    if b.optional(0.5):
        with b.clause("TAXES", "sale.tax", ["TAXES AND OUTGOINGS", "PROPERTY TAX", "OUTGOINGS AND DUES"]):
            b.ob("The {st} shall pay all property taxes, society charges and other outgoings in respect of the said Property up to the date of handing over possession.",
                 actor="seller", action="PAY_TAXES", st=ST)
    if b.optional(0.6):
        with b.clause("STAMP_DUTY", "sale.stamp", ["STAMP DUTY AND REGISTRATION", "STAMP DUTY", "REGISTRATION CHARGES"]):
            b.ob(b.pick("sale.stamp.b", [
                "The stamp duty of {sd} and the registration fee of {rf} payable on the sale deed shall be borne by the {bt}.",
                "The {bt} shall pay the stamp duty amounting to {sd} and registration charges of {rf}.",
            ]), actor="buyer", action="PAY", amount="stamp_duty", purpose="STAMP_DUTY", bt=BT,
                sd=money(stamp_duty, "STAMP_DUTY", "stamp_duty", b.currency, words=False),
                rf=money(reg_fee, "REGISTRATION_FEE", "reg_fee", b.currency, words=False))
            b.relation("MUST_PAY", "buyer", "stamp_duty")

    # --- default / termination (agreement only) ---------------------------------------
    if is_agreement and missing != "DEFAULT":
        with b.clause("DEFAULT", "sale.default", ["DEFAULT", "CONSEQUENCES OF DEFAULT", "BREACH"]):
            if unfair_default and not b.inject:
                b.risk("ONE_SIDED_REMEDY", "one_sided_forfeiture")
                b.emit(b.pick("sale.default.unfair", [
                    "If the {bt} fails to pay the balance by the due date for any reason, the entire advance shall stand forfeited and this Agreement shall stand cancelled, whereas if the {st} fails to perform, the {bt}'s only remedy shall be a refund of the advance without interest.",
                    "Any delay by the {bt} shall entitle the {st} to cancel this Agreement and forfeit the whole of the amounts paid, and the {bt} shall have no claim of any nature against the {st}.",
                ]), st=ST, bt=BT)
            else:
                b.ob(b.pick("sale.default.fair", [
                    "If the {st} fails to complete the sale as agreed, the {st} shall refund the advance to the {bt} with interest at nine per cent per annum.",
                    "Should the {st} commit default, the {st} shall return the advance received together with an equal amount by way of liquidated damages.",
                ]), actor="seller", action="REFUND_ADVANCE", condition="seller default", st=ST, bt=BT)
                b.emit(" If the {bt} defaults in payment of the balance, the {st} may terminate this Agreement after giving fifteen days' written notice.",
                       st=ST, bt=BT)
    elif is_agreement:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="DEFAULT")

    if not is_agreement and b.optional(0.4):
        with b.clause("WARRANTIES", "sale.warr", ["WARRANTIES", "COVENANTS AND WARRANTIES"]):
            b.ob("The {st} shall indemnify and keep indemnified the {bt} against any loss arising from a defect in the {st}'s title to the said Property.",
                 actor="seller", action="INDEMNIFY", st=ST, bt=BT)

    if b.optional(0.35):
        with b.clause("REPRESENTATIONS", "sale.rep", ["REPRESENTATIONS", "COVENANTS OF THE " + ST.upper()]):
            b.t(f"The {ST} represents that no notice of acquisition or requisition has been received in respect of the said "
                f"Property and that the {ST} has not entered into any other agreement for its sale.")
    if not is_agreement and b.optional(0.4):
        with b.clause("REGISTRATION", "sale.reg", ["REGISTRATION", "PRESENTATION FOR REGISTRATION"]):
            b.t(f"The {ST} shall appear before the Sub-Registrar and admit execution of this Deed for its registration.")
    if is_agreement and b.optional(0.3):
        with b.clause("TERMINATION", "sale.term", ["TERMINATION", "CANCELLATION OF AGREEMENT"]):
            b.t("This Agreement may be cancelled by mutual consent in writing, in which case the advance shall be refunded within thirty days.")
    if is_agreement and b.optional(0.25):
        with b.clause("INDEMNITY", "sale.indem", ["INDEMNITY", "INDEMNIFICATION"]):
            b.ob("The {st} shall indemnify the {bt} against any claim by a third party in respect of the said Property arising before the date of the sale deed.",
                 actor="seller", action="INDEMNIFY", st=ST, bt=BT)
    if b.optional(0.6):
        dispute_clause(b, "sale", loc, deed_word)
    if missing != "JURISDICTION":
        jurisdiction_clause(b, "sale", loc, deed_word)
    else:
        b.risk("MISSING_CLAUSE", "missing_clause", clause_type="JURISDICTION")

    # --- schedule ------------------------------------------------------------------------
    b.t("\n")
    with b.section("SCHEDULE_PROPERTY", "SCHEDULE OF THE PROPERTY"):
        b.t(f"All that {property_text} being ")
        sched_survey = alt_survey if active("PROPERTY_IDENTIFIER_CONTRADICTION") and kind != "flat" else survey_no
        sched_flat = alt_flat if active("PROPERTY_IDENTIFIER_CONTRADICTION") and kind == "flat" else flat_no
        write_identifiers(sched_survey, sched_flat)
        sched_area = alt_area if active("PROPERTY_AREA_CONTRADICTION") else area_value
        b.emit(", admeasuring {area}, situated at {city}", area=area(sched_area, area_unit, area_label, "area"),
               city=loc["city"])
        b.t(", and bounded as follows:\n")
        sides = [("North", f"property of {vp.random_person()['name']}"), ("South", rng.choice(["internal road", "open space", "nala"])),
                 ("East", f"{survey_prefix} {vp.random_survey_number(survey_kind)}"), ("West", rng.choice(["main road", "compound wall", "public road"]))]
        for i, (side, what) in enumerate(sides):
            b.t(f"On or towards the {side}: ")
            b.e(textual(what, "BOUNDARY", f"boundary_{i}"))
            b.relation("BOUNDED_BY", "property", f"boundary_{i}")
            b.t("\n")
        if involved("SALE_CONSIDERATION_CONTRADICTION") or restate:
            c2 = alt_consideration if active("SALE_CONSIDERATION_CONTRADICTION") else consideration
            b.emit("Consideration for the above property: {c}\n", c=money(c2, "SALE_CONSIDERATION", "consideration", b.currency, words=False))
    if involved("SALE_CONSIDERATION_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "sale_consideration_single", ["consideration"])
    if involved("PROPERTY_AREA_CONTRADICTION"):
        b.expect("PROPERTY_AREA_CONTRADICTION", "sale_carpet_single" if area_label == "CARPET_AREA" else "sale_land_area_single", ["area"])
    if involved("PROPERTY_IDENTIFIER_CONTRADICTION"):
        b.expect("PROPERTY_IDENTIFIER_CONTRADICTION", "sale_flat_single" if kind == "flat" else "sale_survey_single",
                 ["flat_no" if kind == "flat" else "survey_no"])

    b.t("\n")
    signers = [(ST.upper(), "SELLER", "seller", seller["name"])]
    signers += [(BT.upper(), "BUYER", k, p["name"]) for k, p in zip(["buyer", "buyer_2"], buyers)]
    signatures(b, signers, deed_word)
    return {"city": loc["city"], "state": loc["state"], "property_kind": kind}
