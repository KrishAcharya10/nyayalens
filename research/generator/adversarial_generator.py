"""
Phase 6 adversarial test document generator. Extends (does not replace)
research/generator/generator.py's building blocks (BuiltDocument,
verify_offsets, append/append_entity/start_clause/end_clause) - same
offset-tracking discipline, same verification, no looser approach.

Every document is constructed with an explicit `expected_flag`: which of
the five categories from docs/research/adversarial_test_design.md it
tests (or None for a matched control), and enough detail to grade the
risk engine's output against it automatically (see
research/adversarial_evaluation.py). Every document is offset-verified
via verify_offsets() before being accepted, exactly like the bulk
synthetic generator.

Scoping note (documented, not hidden - see docs/architecture/risk_engine.md):
category 1 (liability shift, via MAINTENANCE) and category 3 (unbounded
discretion, via SECURITY_DEPOSIT) only apply to residential_rental - this
generator's land_lease documents have no maintenance clause or refundable
deposit concept. Category 4 (land use contradiction) only applies to
land_lease - residential_rental has no LAND_USE_TYPE entity. Category 2
(asymmetric obligations) and category 5 (missing clause) apply to both.

New clause phrasings here are deliberately constructed to match Phase 4A's
EXISTING, UNMODIFIED rule-based NER/clause-classification patterns
(apps/api/src/ner/rulePatterns.ts, apps/api/src/clauses/clauseTaxonomy.ts)
- this phase does not touch NER/clause classification at all.
"""

import random
from dataclasses import dataclass, field

import value_pools as vp
from generator import BuiltDocument, verify_offsets

# --- Ontology extensions used only by adversarial documents ---------------

# Deliberately non-agricultural permitted uses, for category 4's
# contradiction cases. "construction of a warehouse facility" already
# exists in vp.PERMITTED_USES_LAND; the other two are new, equally
# unambiguous additions (matched by the same rule-based
# NON_AGRICULTURAL_USE_PATTERNS in apps/api/src/risk/pass2CrossClause.ts).
NON_AGRICULTURAL_USES = [
    "construction of a warehouse facility",
    "commercial retail development",
    "industrial processing operations",
]

# Agricultural-compatible uses, for category 4's matched controls.
AGRICULTURAL_USES = [
    "cultivation of seasonal crops",
    "agricultural storage purposes",
    "dairy farming operations",
    "horticultural plantation",
]

DISCRETIONARY_DEDUCTION_PHRASES = [
    "as deemed fit by the Landlord",
    "at the sole discretion of the Landlord",
    "as determined solely by the Landlord",
]


@dataclass
class ExpectedFlag:
    category: str | None  # None for a control (no injected risk)
    detail: dict = field(default_factory=dict)


@dataclass
class AdversarialDocument:
    doc: BuiltDocument
    expected_flag: ExpectedFlag
    is_control: bool


def _fill(template: str, **kwargs) -> str:
    return template.format(**kwargs)


# --- Shared preamble (identical structure to generator.py's originals) ---


def _residential_preamble(doc: BuiltDocument) -> dict:
    city = random.choice(vp.INDIAN_CITIES)
    state = random.choice(vp.STATES)
    tenant_name = vp.random_person_name()
    landlord_name = vp.random_person_name()

    doc.append("RESIDENTIAL RENTAL AGREEMENT\n\n")
    doc.append("This Rental Agreement is executed at ")
    doc.append_entity(city, "ADDRESS")
    doc.append(" between:\n\n")
    doc.append("LANDLORD: ")
    doc.append_entity(landlord_name, "LANDLORD")
    doc.append(", hereinafter referred to as the 'Landlord',\n\nAND\n\n")
    doc.append("TENANT: ")
    doc.append_entity(tenant_name, "TENANT")
    doc.append(", hereinafter referred to as the 'Tenant'.\n\n")
    doc.append(f"This Agreement is governed by the laws of {state}.\n\n")
    doc.append(
        "WHEREAS the Landlord is the owner of the residential premises situated at the "
        "above address, and has agreed to let out the same to the Tenant on the following terms:\n\n"
    )
    return {"city": city, "state": state, "tenant_name": tenant_name, "landlord_name": landlord_name}


def _land_lease_preamble(doc: BuiltDocument) -> dict:
    city = random.choice(vp.INDIAN_CITIES)
    state = random.choice(vp.STATES)
    lessor_name = vp.random_person_name()
    lessee_name = vp.random_person_name()
    survey_no = vp.random_survey_number()
    land_area = vp.random_land_area()

    doc.append("LAND LEASE DEED\n\n")
    doc.append("This Deed of Lease is executed at ")
    doc.append_entity(city, "ADDRESS")
    doc.append(" between:\n\n")
    doc.append("LESSOR: ")
    doc.append_entity(lessor_name, "LESSOR")
    doc.append(", hereinafter referred to as the 'Lessor',\n\nAND\n\n")
    doc.append("LESSEE: ")
    doc.append_entity(lessee_name, "LESSEE")
    doc.append(", hereinafter referred to as the 'Lessee'.\n\n")
    doc.append(f"This Deed is governed by the laws of {state}.\n\n")
    doc.append("WHEREAS the Lessor is the absolute owner of the land bearing Survey No. ")
    doc.append_entity(survey_no, "SURVEY_NUMBER")
    doc.append(", admeasuring ")
    doc.append_entity(land_area, "LAND_AREA")
    doc.append(", classified as ")
    return {
        "city": city,
        "state": state,
        "lessor_name": lessor_name,
        "lessee_name": lessee_name,
        "survey_no": survey_no,
        "land_area": land_area,
    }


def _closing(doc: BuiltDocument, deed: bool) -> None:
    doc.append(
        f"\nIN WITNESS WHEREOF, the parties have {'executed this Deed' if deed else 'signed this Agreement'} "
        "on the date first above written.\n"
    )


def _standard_clause(doc: BuiltDocument, clause_no: int, heading: str, body: str, label: str) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. {heading}\n")
    doc.append(body + "\n\n")
    doc.end_clause(c_start, label, str(clause_no))


def _duration_clause(doc: BuiltDocument, clause_no: int, value: str, deed: bool) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. LEASE DURATION\n")
    if deed:
        doc.append("This Lease shall remain in force for a period of ")
    else:
        doc.append("This Agreement shall remain valid for a period of ")
    doc.append_entity(value, "DURATION")
    if deed:
        doc.append(" from the date of execution hereof.\n\n")
    else:
        doc.append(" commencing from the date of execution hereof.\n\n")
    doc.end_clause(c_start, "LEASE_DURATION", str(clause_no))


def _rent_clause_residential(doc: BuiltDocument, clause_no: int, rent: str, due_day: str) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. RENT PAYMENT\n")
    doc.append("The Tenant agrees to remit a sum of ")
    doc.append_entity(rent, "RENT")
    doc.append(f" per month towards rent, such payment to be made no later than the {due_day} of each month.\n\n")
    doc.end_clause(c_start, "RENT_PAYMENT", str(clause_no))


def _rent_clause_land(doc: BuiltDocument, clause_no: int, rent: str, due_month: str) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. ANNUAL LEASE RENT\n")
    doc.append("Annual rent of ")
    doc.append_entity(rent, "RENT")
    doc.append(
        f" for the leased land shall be paid by the Lessee to the Lessor on or before {due_month} of every calendar year.\n\n"
    )
    doc.end_clause(c_start, "RENT_PAYMENT", str(clause_no))


def _lease_premium_clause(doc: BuiltDocument, clause_no: int, premium: str) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. LEASE PREMIUM\n")
    doc.append("The Lessee shall pay a one-time lease premium of ")
    doc.append_entity(premium, "LEASE_PREMIUM")
    doc.append(" to the Lessor upon execution of this Deed.\n\n")
    doc.end_clause(c_start, "LEASE_PREMIUM", str(clause_no))


def _security_deposit_clause(doc: BuiltDocument, clause_no: int, deposit: str, discretionary: bool) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. SECURITY DEPOSIT\n")
    doc.append("The Tenant shall pay an interest-free refundable security deposit of ")
    doc.append_entity(deposit, "SECURITY_DEPOSIT")
    if discretionary:
        phrase = random.choice(DISCRETIONARY_DEDUCTION_PHRASES)
        doc.append(f" to the Landlord prior to taking possession, refundable subject to deductions {phrase}.\n\n")
    else:
        doc.append(
            " to the Landlord prior to taking possession, refundable within 30 days of vacating the "
            "premises subject to an itemized list of deductions not exceeding 10% of the deposit.\n\n"
        )
    doc.end_clause(c_start, "SECURITY_DEPOSIT", str(clause_no))


def _maintenance_clause(doc: BuiltDocument, clause_no: int, shift_to_tenant: bool) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. MAINTENANCE\n")
    if shift_to_tenant:
        doc.append(
            "The Landlord shall be responsible for routine maintenance of the premises, while "
            "structural repairs shall be borne by the Tenant.\n\n"
        )
    else:
        doc.append(
            "The Tenant shall be responsible for routine maintenance of the premises, while "
            "structural repairs shall be borne by the Landlord.\n\n"
        )
    doc.end_clause(c_start, "MAINTENANCE", str(clause_no))


def _asymmetric_notice_clauses(
    doc: BuiltDocument, clause_no: int, party_a: str, party_b: str, days_a: int, days_b: int
) -> int:
    for party, other, days in [(party_a, party_b, days_a), (party_b, party_a, days_b)]:
        c_start = doc.start_clause()
        # A hyphen, not parentheses, because the clause segmenter's heading
        # regex (apps/api/src/clauses/clauseSegmenter.ts) only allows
        # [A-Z /&,-] in a heading line - parentheses would silently fail to
        # match at all, merging this clause into whatever precedes it.
        doc.append(f"{clause_no}. NOTICE PERIOD - {party.upper()}\n")
        doc.append(f"The {party} may terminate this ")
        doc.append("Deed" if party in ("Lessor", "Lessee") else "Agreement")
        doc.append(" by serving a notice period of ")
        doc.append_entity(f"{days} days", "NOTICE_PERIOD")
        doc.append(f" in writing to the {other}.\n\n")
        doc.end_clause(c_start, "NOTICE_PERIOD", str(clause_no))
        clause_no += 1
    return clause_no


def _land_use_restriction_clause(doc: BuiltDocument, clause_no: int, permitted_use: str) -> None:
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. PERMITTED USE\n")
    doc.append("The land hereby leased shall be utilised exclusively for ")
    doc.append_entity(permitted_use, "LAND_USE_RESTRICTION")
    doc.append("; any change in use shall require the Lessor's written approval.\n\n")
    doc.end_clause(c_start, "LAND_USE_RESTRICTION", str(clause_no))


def _termination_clause(doc: BuiltDocument, clause_no: int) -> None:
    _standard_clause(
        doc,
        clause_no,
        "TERMINATION",
        random.choice(vp.TERMINATION_PHRASINGS),
        "TERMINATION",
    )


def _dispute_resolution_clause(doc: BuiltDocument, clause_no: int, city: str) -> None:
    _standard_clause(
        doc,
        clause_no,
        "DISPUTE RESOLUTION",
        _fill(random.choice(vp.DISPUTE_RESOLUTION_PHRASINGS), city=city),
        "DISPUTE_RESOLUTION",
    )


def _jurisdiction_clause(doc: BuiltDocument, clause_no: int, city: str) -> None:
    _standard_clause(
        doc,
        clause_no,
        "JURISDICTION",
        _fill(random.choice(vp.JURISDICTION_PHRASINGS), city=city),
        "JURISDICTION",
    )


# ---------------------------------------------------------------------
# Category 1: silent liability shift (residential_rental only)
# ---------------------------------------------------------------------


def build_liability_shift(doc_id: str, adversarial: bool) -> AdversarialDocument:
    doc = BuiltDocument(doc_id=doc_id, document_type="residential_rental")
    ctx = _residential_preamble(doc)
    n = 1
    _duration_clause(doc, n, f"{random.choice(vp.LEASE_DURATIONS_MONTHS)} months", deed=False)
    n += 1
    _rent_clause_residential(doc, n, vp.random_rent(), random.choice(["5th", "7th", "10th", "1st"]))
    n += 1
    deposit = vp.random_deposit(vp.random_rent())
    _security_deposit_clause(doc, n, deposit, discretionary=False)
    n += 1
    _maintenance_clause(doc, n, shift_to_tenant=adversarial)
    maintenance_clause_no = n
    n += 1
    _termination_clause(doc, n)
    n += 1
    _dispute_resolution_clause(doc, n, ctx["city"])
    n += 1
    _jurisdiction_clause(doc, n, ctx["city"])
    _closing(doc, deed=False)
    doc.metadata = {
        "document_type": "residential_rental",
        "is_synthetic": True,
        "is_adversarial": True,
        "city": ctx["city"],
        "state": ctx["state"],
        "schema_version": "1.0",
    }
    flag = ExpectedFlag(
        category="LIABILITY_SHIFT" if adversarial else None,
        detail={"clause_number": str(maintenance_clause_no)} if adversarial else {},
    )
    return AdversarialDocument(doc=doc, expected_flag=flag, is_control=not adversarial)


# ---------------------------------------------------------------------
# Category 2: asymmetric obligations (both document types)
# ---------------------------------------------------------------------


def build_asymmetric_obligation(doc_id: str, document_type: str, adversarial: bool) -> AdversarialDocument:
    days_a, days_b = (15, 60) if adversarial else (30, 30)

    if document_type == "residential_rental":
        doc = BuiltDocument(doc_id=doc_id, document_type="residential_rental")
        ctx = _residential_preamble(doc)
        n = 1
        _duration_clause(doc, n, f"{random.choice(vp.LEASE_DURATIONS_MONTHS)} months", deed=False)
        n += 1
        _rent_clause_residential(doc, n, vp.random_rent(), random.choice(["5th", "7th", "10th", "1st"]))
        n += 1
        deposit = vp.random_deposit(vp.random_rent())
        _security_deposit_clause(doc, n, deposit, discretionary=False)
        n += 1
        notice_start_no = n
        n = _asymmetric_notice_clauses(doc, n, "Landlord", "Tenant", days_a, days_b)
        _termination_clause(doc, n)
        n += 1
        _dispute_resolution_clause(doc, n, ctx["city"])
        n += 1
        _jurisdiction_clause(doc, n, ctx["city"])
        _closing(doc, deed=False)
        doc.metadata = {
            "document_type": "residential_rental",
            "is_synthetic": True,
            "is_adversarial": True,
            "city": ctx["city"],
            "state": ctx["state"],
            "schema_version": "1.0",
        }
    else:
        doc = BuiltDocument(doc_id=doc_id, document_type="land_lease")
        ctx = _land_lease_preamble(doc)
        doc.append_entity("Agricultural", "LAND_USE_TYPE")
        doc.append(" land, and has agreed to lease the same to the Lessee on the following terms:\n\n")
        n = 1
        _duration_clause(doc, n, f"{random.choice([5, 10, 15, 20, 30])} years", deed=True)
        n += 1
        _lease_premium_clause(doc, n, vp.random_lease_premium())
        n += 1
        _rent_clause_land(doc, n, vp.random_rent(low=20000, high=300000), vp.random_month())
        n += 1
        _land_use_restriction_clause(doc, n, random.choice(AGRICULTURAL_USES))
        n += 1
        notice_start_no = n
        n = _asymmetric_notice_clauses(doc, n, "Lessor", "Lessee", days_a, days_b)
        _termination_clause(doc, n)
        n += 1
        _dispute_resolution_clause(doc, n, ctx["city"])
        n += 1
        _jurisdiction_clause(doc, n, ctx["city"])
        _closing(doc, deed=True)
        doc.metadata = {
            "document_type": "land_lease",
            "is_synthetic": True,
            "is_adversarial": True,
            "city": ctx["city"],
            "state": ctx["state"],
            "schema_version": "1.0",
        }

    flag = ExpectedFlag(
        category="ASYMMETRIC_OBLIGATION" if adversarial else None,
        detail={"clause_numbers": [str(notice_start_no), str(notice_start_no + 1)]} if adversarial else {},
    )
    return AdversarialDocument(doc=doc, expected_flag=flag, is_control=not adversarial)


# ---------------------------------------------------------------------
# Category 3: vague discretionary language (residential_rental only)
# ---------------------------------------------------------------------


def build_unbounded_discretion(doc_id: str, adversarial: bool) -> AdversarialDocument:
    doc = BuiltDocument(doc_id=doc_id, document_type="residential_rental")
    ctx = _residential_preamble(doc)
    n = 1
    _duration_clause(doc, n, f"{random.choice(vp.LEASE_DURATIONS_MONTHS)} months", deed=False)
    n += 1
    _rent_clause_residential(doc, n, vp.random_rent(), random.choice(["5th", "7th", "10th", "1st"]))
    n += 1
    deposit_clause_no = n
    deposit = vp.random_deposit(vp.random_rent())
    _security_deposit_clause(doc, n, deposit, discretionary=adversarial)
    n += 1
    _maintenance_clause(doc, n, shift_to_tenant=False)
    n += 1
    _termination_clause(doc, n)
    n += 1
    _dispute_resolution_clause(doc, n, ctx["city"])
    n += 1
    _jurisdiction_clause(doc, n, ctx["city"])
    _closing(doc, deed=False)
    doc.metadata = {
        "document_type": "residential_rental",
        "is_synthetic": True,
        "is_adversarial": True,
        "city": ctx["city"],
        "state": ctx["state"],
        "schema_version": "1.0",
    }
    flag = ExpectedFlag(
        category="UNBOUNDED_DISCRETION" if adversarial else None,
        detail={"clause_number": str(deposit_clause_no)} if adversarial else {},
    )
    return AdversarialDocument(doc=doc, expected_flag=flag, is_control=not adversarial)


# ---------------------------------------------------------------------
# Category 4: land use contradiction (land_lease only)
# ---------------------------------------------------------------------


def build_land_use_contradiction(doc_id: str, adversarial: bool) -> AdversarialDocument:
    doc = BuiltDocument(doc_id=doc_id, document_type="land_lease")
    ctx = _land_lease_preamble(doc)
    doc.append_entity("Agricultural", "LAND_USE_TYPE")
    doc.append(" land, and has agreed to lease the same to the Lessee on the following terms:\n\n")

    n = 1
    _duration_clause(doc, n, f"{random.choice([5, 10, 15, 20, 30])} years", deed=True)
    n += 1
    _lease_premium_clause(doc, n, vp.random_lease_premium())
    n += 1
    _rent_clause_land(doc, n, vp.random_rent(low=20000, high=300000), vp.random_month())
    n += 1
    restriction_clause_no = n
    permitted_use = random.choice(NON_AGRICULTURAL_USES) if adversarial else random.choice(AGRICULTURAL_USES)
    _land_use_restriction_clause(doc, n, permitted_use)
    n += 1
    _termination_clause(doc, n)
    n += 1
    _dispute_resolution_clause(doc, n, ctx["city"])
    n += 1
    _jurisdiction_clause(doc, n, ctx["city"])
    _closing(doc, deed=True)
    doc.metadata = {
        "document_type": "land_lease",
        "is_synthetic": True,
        "is_adversarial": True,
        "city": ctx["city"],
        "state": ctx["state"],
        "schema_version": "1.0",
    }
    flag = ExpectedFlag(
        category="LAND_USE_CONTRADICTION" if adversarial else None,
        detail={"clause_number": str(restriction_clause_no), "permitted_use": permitted_use} if adversarial else {},
    )
    return AdversarialDocument(doc=doc, expected_flag=flag, is_control=not adversarial)


# ---------------------------------------------------------------------
# Category 5: clean absence / missing clause (both document types)
# ---------------------------------------------------------------------

RESIDENTIAL_OMITTABLE = ["DISPUTE_RESOLUTION", "TERMINATION", "JURISDICTION", "SECURITY_DEPOSIT"]
LAND_LEASE_OMITTABLE = ["DISPUTE_RESOLUTION", "TERMINATION", "JURISDICTION", "LEASE_PREMIUM"]


def build_missing_clause(doc_id: str, document_type: str, omit: str | None) -> AdversarialDocument:
    if document_type == "residential_rental":
        doc = BuiltDocument(doc_id=doc_id, document_type="residential_rental")
        ctx = _residential_preamble(doc)
        n = 1
        _duration_clause(doc, n, f"{random.choice(vp.LEASE_DURATIONS_MONTHS)} months", deed=False)
        n += 1
        _rent_clause_residential(doc, n, vp.random_rent(), random.choice(["5th", "7th", "10th", "1st"]))
        n += 1
        if omit != "SECURITY_DEPOSIT":
            _security_deposit_clause(doc, n, vp.random_deposit(vp.random_rent()), discretionary=False)
            n += 1
        _maintenance_clause(doc, n, shift_to_tenant=False)
        n += 1
        if omit != "TERMINATION":
            _termination_clause(doc, n)
            n += 1
        if omit != "DISPUTE_RESOLUTION":
            _dispute_resolution_clause(doc, n, ctx["city"])
            n += 1
        if omit != "JURISDICTION":
            _jurisdiction_clause(doc, n, ctx["city"])
            n += 1
        _closing(doc, deed=False)
        doc.metadata = {
            "document_type": "residential_rental",
            "is_synthetic": True,
            "is_adversarial": True,
            "city": ctx["city"],
            "state": ctx["state"],
            "schema_version": "1.0",
        }
    else:
        doc = BuiltDocument(doc_id=doc_id, document_type="land_lease")
        ctx = _land_lease_preamble(doc)
        doc.append_entity("Agricultural", "LAND_USE_TYPE")
        doc.append(" land, and has agreed to lease the same to the Lessee on the following terms:\n\n")
        n = 1
        _duration_clause(doc, n, f"{random.choice([5, 10, 15, 20, 30])} years", deed=True)
        n += 1
        if omit != "LEASE_PREMIUM":
            _lease_premium_clause(doc, n, vp.random_lease_premium())
            n += 1
        _rent_clause_land(doc, n, vp.random_rent(low=20000, high=300000), vp.random_month())
        n += 1
        _land_use_restriction_clause(doc, n, random.choice(AGRICULTURAL_USES))
        n += 1
        if omit != "TERMINATION":
            _termination_clause(doc, n)
            n += 1
        if omit != "DISPUTE_RESOLUTION":
            _dispute_resolution_clause(doc, n, ctx["city"])
            n += 1
        if omit != "JURISDICTION":
            _jurisdiction_clause(doc, n, ctx["city"])
            n += 1
        _closing(doc, deed=True)
        doc.metadata = {
            "document_type": "land_lease",
            "is_synthetic": True,
            "is_adversarial": True,
            "city": ctx["city"],
            "state": ctx["state"],
            "schema_version": "1.0",
        }

    flag = ExpectedFlag(
        category="MISSING_CLAUSE" if omit else None,
        detail={"missing_clause_type": omit} if omit else {},
    )
    return AdversarialDocument(doc=doc, expected_flag=flag, is_control=omit is None)


def verify(adv: AdversarialDocument) -> bool:
    return verify_offsets(adv.doc)
