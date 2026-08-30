"""
NyayaLens synthetic document generator.

Core design principle: every entity value is inserted via explicit
string-building, so its exact character offset in the final document
is known at generation time. No post-hoc NER/string-matching is used
to find labels -- this guarantees the synthetic labels are exactly
correct, which is the entire point of using synthetic data here.

Output per document:
  - <doc_id>.txt              plain text of the agreement
  - <doc_id>.labels.json      entities + clauses with char offsets (BIO-ready)
  - <doc_id>.docx / .pdf      rendered file formats
"""
import random
from dataclasses import dataclass, field

import value_pools as vp

random.seed()  # non-deterministic across runs; set an int here for reproducibility


@dataclass
class EntitySpan:
    start: int
    end: int
    label: str
    text: str


@dataclass
class ClauseSpan:
    start: int
    end: int
    label: str
    text: str
    clause_number: str


@dataclass
class BuiltDocument:
    doc_id: str
    document_type: str  # "residential_rental" | "land_lease"
    text: str = ""
    entities: list = field(default_factory=list)
    clauses: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def append(self, segment: str):
        """Append plain text (e.g. headings, whitespace) with no label."""
        self.text += segment

    def append_entity(self, segment: str, label: str):
        """Append text and record it as a labeled entity span."""
        start = len(self.text)
        self.text += segment
        end = len(self.text)
        self.entities.append(EntitySpan(start, end, label, segment))

    def start_clause(self):
        return len(self.text)

    def end_clause(self, start: int, label: str, clause_number: str):
        end = len(self.text)
        self.clauses.append(ClauseSpan(start, end, label, self.text[start:end], clause_number))


def _fill_template(template: str, **kwargs) -> str:
    return template.format(**kwargs)


def build_residential_rental(doc_id: str) -> BuiltDocument:
    doc = BuiltDocument(doc_id=doc_id, document_type="residential_rental")

    city = random.choice(vp.INDIAN_CITIES)
    state = random.choice(vp.STATES)
    tenant_name = vp.random_person_name()
    landlord_name = vp.random_person_name()
    rent = vp.random_rent()
    deposit = vp.random_deposit(rent)
    notice_days = random.choice(vp.NOTICE_PERIODS_DAYS)
    duration_months = random.choice(vp.LEASE_DURATIONS_MONTHS)
    due_day = random.choice(["5th", "7th", "10th", "1st"])

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
    doc.append("WHEREAS the Landlord is the owner of the residential premises situated at the "
                "above address, and has agreed to let out the same to the Tenant on the following terms:\n\n")

    clause_no = 1

    # Clause 1: Duration
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. LEASE DURATION\n")
    doc.append("This Agreement shall remain valid for a period of ")
    doc.append_entity(f"{duration_months} months", "DURATION")
    doc.append(" commencing from the date of execution hereof.\n\n")
    doc.end_clause(c_start, "LEASE_DURATION", str(clause_no))
    clause_no += 1

    # Clause 2: Rent payment
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. RENT PAYMENT\n")
    template = random.choice(vp.RENT_PAYMENT_PHRASINGS)
    prefix, _, suffix = template.partition("{rent}")
    doc.append(_fill_template(prefix, due_day=due_day))
    doc.append_entity(rent, "RENT")
    remainder = suffix.format(due_day=due_day)
    doc.append(remainder + "\n\n")
    doc.end_clause(c_start, "RENT_PAYMENT", str(clause_no))
    clause_no += 1

    # Clause 3: Security deposit
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. SECURITY DEPOSIT\n")
    template = random.choice(vp.SECURITY_DEPOSIT_PHRASINGS)
    prefix, _, suffix = template.partition("{deposit}")
    doc.append(prefix)
    doc.append_entity(deposit, "SECURITY_DEPOSIT")
    doc.append(suffix + "\n\n")
    doc.end_clause(c_start, "SECURITY_DEPOSIT", str(clause_no))
    clause_no += 1

    # Clause 4: Notice period (optionally omitted to simulate MISSING_CLAUSE cases)
    if random.random() > 0.15:
        c_start = doc.start_clause()
        doc.append(f"{clause_no}. TERMINATION NOTICE\n")
        template = random.choice(vp.NOTICE_PERIOD_PHRASINGS)
        prefix, _, suffix = template.partition("{notice_days}")
        doc.append(prefix)
        doc.append_entity(f"{notice_days} days", "NOTICE_PERIOD")
        doc.append(suffix + "\n\n")
        doc.end_clause(c_start, "NOTICE_PERIOD", str(clause_no))
        clause_no += 1

    # Clause 5: Maintenance
    if random.random() > 0.1:
        c_start = doc.start_clause()
        doc.append(f"{clause_no}. MAINTENANCE\n")
        doc.append(random.choice(vp.MAINTENANCE_PHRASINGS) + "\n\n")
        doc.end_clause(c_start, "MAINTENANCE", str(clause_no))
        clause_no += 1

    # Clause 6: Termination
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. TERMINATION\n")
    doc.append(random.choice(vp.TERMINATION_PHRASINGS) + "\n\n")
    doc.end_clause(c_start, "TERMINATION", str(clause_no))
    clause_no += 1

    # Clause 7: Dispute resolution
    if random.random() > 0.2:
        c_start = doc.start_clause()
        doc.append(f"{clause_no}. DISPUTE RESOLUTION\n")
        doc.append(_fill_template(random.choice(vp.DISPUTE_RESOLUTION_PHRASINGS), city=city) + "\n\n")
        doc.end_clause(c_start, "DISPUTE_RESOLUTION", str(clause_no))
        clause_no += 1

    # Clause 8: Jurisdiction
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. JURISDICTION\n")
    doc.append(_fill_template(random.choice(vp.JURISDICTION_PHRASINGS), city=city) + "\n\n")
    doc.end_clause(c_start, "JURISDICTION", str(clause_no))
    clause_no += 1

    doc.append("\nIN WITNESS WHEREOF, the parties have signed this Agreement on the date first above written.\n")

    doc.metadata = {
        "document_type": "residential_rental",
        "is_synthetic": True,
        "city": city,
        "state": state,
        "schema_version": "1.0",
    }
    return doc


def build_land_lease(doc_id: str) -> BuiltDocument:
    doc = BuiltDocument(doc_id=doc_id, document_type="land_lease")

    city = random.choice(vp.INDIAN_CITIES)
    state = random.choice(vp.STATES)
    lessor_name = vp.random_person_name()
    lessee_name = vp.random_person_name()
    survey_no = vp.random_survey_number()
    land_area = vp.random_land_area()
    land_use_type = random.choice(vp.LAND_USE_TYPES)
    permitted_use = random.choice(vp.PERMITTED_USES_LAND)
    premium = vp.random_lease_premium()
    annual_rent = vp.random_rent(low=20000, high=300000)
    duration_years = random.choice([5, 10, 15, 20, 30])
    due_month = vp.random_month()

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
    doc.append_entity(land_use_type, "LAND_USE_TYPE")
    doc.append(" land, and has agreed to lease the same to the Lessee on the following terms:\n\n")

    clause_no = 1

    # Clause: Duration
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. LEASE DURATION\n")
    doc.append("This Lease shall remain in force for a period of ")
    doc.append_entity(f"{duration_years} years", "DURATION")
    doc.append(" from the date of execution hereof.\n\n")
    doc.end_clause(c_start, "LEASE_DURATION", str(clause_no))
    clause_no += 1

    # Clause: Lease premium
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. LEASE PREMIUM\n")
    template = random.choice(vp.LEASE_PREMIUM_PHRASINGS)
    prefix, _, suffix = template.partition("{premium}")
    doc.append(prefix)
    doc.append_entity(premium, "LEASE_PREMIUM")
    doc.append(suffix + "\n\n")
    doc.end_clause(c_start, "LEASE_PREMIUM", str(clause_no))
    clause_no += 1

    # Clause: Annual rent
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. ANNUAL LEASE RENT\n")
    template = random.choice(vp.LAND_ANNUAL_RENT_PHRASINGS)
    prefix, _, suffix = template.partition("{rent}")
    doc.append(prefix)
    doc.append_entity(annual_rent, "RENT")
    remainder = suffix.format(due_month=due_month)
    doc.append(remainder + "\n\n")
    doc.end_clause(c_start, "RENT_PAYMENT", str(clause_no))
    clause_no += 1

    # Clause: Permitted use / land use restriction
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. PERMITTED USE\n")
    template = random.choice(vp.LAND_USE_RESTRICTION_PHRASINGS)
    prefix, _, suffix = template.partition("{permitted_use}")
    doc.append(prefix)
    doc.append_entity(permitted_use, "LAND_USE_RESTRICTION")
    doc.append(suffix + "\n\n")
    doc.end_clause(c_start, "LAND_USE_RESTRICTION", str(clause_no))
    clause_no += 1

    # Clause: Encumbrance declaration
    if random.random() > 0.15:
        c_start = doc.start_clause()
        doc.append(f"{clause_no}. ENCUMBRANCE DECLARATION\n")
        template = random.choice(vp.ENCUMBRANCE_PHRASINGS)
        prefix, _, suffix = template.partition("{survey_no}")
        doc.append(prefix)
        doc.append_entity(survey_no, "SURVEY_NUMBER")
        doc.append(suffix + "\n\n")
        doc.end_clause(c_start, "ENCUMBRANCE_DECLARATION", str(clause_no))
        clause_no += 1

    # Clause: Termination
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. TERMINATION\n")
    doc.append(random.choice(vp.TERMINATION_PHRASINGS) + "\n\n")
    doc.end_clause(c_start, "TERMINATION", str(clause_no))
    clause_no += 1

    # Clause: Dispute resolution
    if random.random() > 0.2:
        c_start = doc.start_clause()
        doc.append(f"{clause_no}. DISPUTE RESOLUTION\n")
        doc.append(_fill_template(random.choice(vp.DISPUTE_RESOLUTION_PHRASINGS), city=city) + "\n\n")
        doc.end_clause(c_start, "DISPUTE_RESOLUTION", str(clause_no))
        clause_no += 1

    # Clause: Jurisdiction
    c_start = doc.start_clause()
    doc.append(f"{clause_no}. JURISDICTION\n")
    doc.append(_fill_template(random.choice(vp.JURISDICTION_PHRASINGS), city=city) + "\n\n")
    doc.end_clause(c_start, "JURISDICTION", str(clause_no))
    clause_no += 1

    doc.append("\nIN WITNESS WHEREOF, the parties have executed this Deed on the date first above written.\n")

    doc.metadata = {
        "document_type": "land_lease",
        "is_synthetic": True,
        "city": city,
        "state": state,
        "schema_version": "1.0",
    }
    return doc


def to_bio_labels(doc: BuiltDocument) -> dict:
    """Convert char-offset entity/clause spans into the JSON schema
    expected by prepare_dataset.py (Section 28 of the spec)."""
    return {
        "doc_id": doc.doc_id,
        "document_type": doc.document_type,
        "text": doc.text,
        "entities": [
            {"start": e.start, "end": e.end, "label": e.label, "text": e.text}
            for e in doc.entities
        ],
        "clauses": [
            {
                "start": c.start,
                "end": c.end,
                "label": c.label,
                "clause_number": c.clause_number,
                "text": c.text,
            }
            for c in doc.clauses
        ],
        "metadata": doc.metadata,
    }


def verify_offsets(doc: BuiltDocument) -> bool:
    """Sanity check: every recorded span must match the actual substring
    at those offsets in the final text. Fails loudly if not -- this is
    the safeguard against the labels silently drifting from the text."""
    ok = True
    for e in doc.entities:
        if doc.text[e.start:e.end] != e.text:
            print(f"[MISMATCH] entity {e.label}: expected {e.text!r}, "
                  f"found {doc.text[e.start:e.end]!r}")
            ok = False
    for c in doc.clauses:
        if doc.text[c.start:c.end] != c.text:
            print(f"[MISMATCH] clause {c.label}: offsets do not match text")
            ok = False
    return ok
