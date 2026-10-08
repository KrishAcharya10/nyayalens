"""
Question-answer benchmark generated from ground-truth annotations.

Every question's expected answer and evidence come from the document's own
labeled spans - nothing is written by hand per document. Five types:

  factual       "What is the sale consideration?"      -> one span
  unanswerable  a field the document does not contain   -> NOT_SUFFICIENT
  cross_clause  needs two facts from different clauses  -> two spans
  multi_hop     arithmetic over facts (consideration - advance)
  contradiction "Is X stated consistently?" on adversarial/control pairs
"""

QUESTION_TEXT = {
    "LANDLORD": "Who is the landlord?", "TENANT": "Who is the tenant?",
    "LESSOR": "Who is the lessor?", "LESSEE": "Who is the lessee?",
    "LICENSOR": "Who is the licensor?", "LICENSEE": "Who is the licensee?",
    "SELLER": "Who is the seller?", "BUYER": "Who is the buyer?",
    "PROMOTER": "Who is the promoter?", "ALLOTTEE": "Who is the allottee?",
    "EMPLOYER": "Who is the employer?", "EMPLOYEE": "Who is the employee?",
    "DISCLOSING_PARTY": "Who is the disclosing party?", "RECEIVING_PARTY": "Who is the receiving party?",
    "CLIENT": "Who is the client?", "SERVICE_PROVIDER": "Who is the service provider?",
    "RENT": "What is the rent?", "SECURITY_DEPOSIT": "What is the security deposit?",
    "DURATION": "What is the term of the agreement?", "NOTICE_PERIOD": "What is the notice period?",
    "LOCK_IN_PERIOD": "What is the lock-in period?", "PROPERTY_ADDRESS": "Where is the property located?",
    "COMMENCEMENT_DATE": "When does the agreement commence?", "EXPIRY_DATE": "When does the agreement expire?",
    "ESCALATION_RATE": "By how much does the rent or fee increase?", "JURISDICTION": "Which courts have jurisdiction?",
    "SURVEY_NUMBER": "What is the survey number?", "LAND_AREA": "What is the land area?",
    "LAND_USE_TYPE": "How is the land classified?", "LAND_USE_RESTRICTION": "What is the permitted use of the land?",
    "LEASE_PREMIUM": "What is the lease premium?", "KHATA_NUMBER": "What is the khata number?",
    "LICENSED_PREMISES": "What are the licensed premises?", "LICENSE_FEE": "What is the license fee?",
    "LICENSE_PERIOD": "What is the license period?", "PERMITTED_USE": "What is the permitted use of the premises?",
    "SALE_CONSIDERATION": "What is the sale consideration?", "ADVANCE_AMOUNT": "What is the advance amount?",
    "BALANCE_AMOUNT": "What is the balance amount?", "PROPERTY": "What property is being transferred?",
    "CARPET_AREA": "What is the carpet area?", "POSSESSION_DATE": "When is possession due?",
    "FLAT_NUMBER": "What is the flat number?", "STAMP_DUTY": "What is the stamp duty?",
    "BANK": "Which bank holds a mortgage on the property?", "PROJECT": "What is the name of the project?",
    "UNIT": "Which unit is allotted?", "BOOKING_AMOUNT": "What is the booking amount?",
    "GRACE_PERIOD": "What is the grace period for possession?",
    "DEFECT_LIABILITY_PERIOD": "What is the defect liability period?",
    "REGISTRATION_REFERENCE": "What is the RERA registration number?", "PAYMENT_PLAN": "What is the payment plan?",
    "JOB_TITLE": "What is the job title?", "CTC": "What is the annual CTC?", "SALARY": "What is the monthly salary?",
    "JOINING_DATE": "What is the joining date?", "PROBATION_PERIOD": "What is the probation period?",
    "WORK_LOCATION": "Where is the work location?", "LEAVE_ENTITLEMENT": "How much paid leave is allowed?",
    "WORKING_HOURS": "What are the working hours?", "NON_COMPETE_PERIOD": "How long is the non-compete period?",
    "CONFIDENTIAL_INFORMATION": "What information is confidential?",
    "CONFIDENTIALITY_PERIOD": "How long does confidentiality survive?", "TERM": "What is the term of the agreement?",
    "PURPOSE": "What is the purpose of the agreement?", "SERVICE": "What services are provided?",
    "FEE": "What is the fee?", "PAYMENT_TERM": "Within how many days must invoices be paid?",
    "LIABILITY_CAP": "What is the liability cap?", "EFFECTIVE_DATE": "When is the agreement effective?",
    "TERMINATION_NOTICE": "How much notice is needed to terminate the agreement?",
}

# Fields asked of other domains' documents as "unanswerable" probes.
FOREIGN_PROBES = ["PROBATION_PERIOD", "CARPET_AREA", "LICENSE_FEE", "CONFIDENTIALITY_PERIOD", "SURVEY_NUMBER",
                  "BOOKING_AMOUNT", "CTC", "LEASE_PREMIUM"]

MULTI_HOP = [
    # (question, minuend label, subtrahend label, answer label for evidence)
    ("How much of the sale consideration remains payable after the advance?", "SALE_CONSIDERATION", "ADVANCE_AMOUNT"),
    ("How much of the total price remains after the booking amount?", "SALE_CONSIDERATION", "BOOKING_AMOUNT"),
]

CROSS_CLAUSE = [
    ("What are the advance and the balance amounts?", "ADVANCE_AMOUNT", "BALANCE_AMOUNT"),
    ("What is the rent and what is the security deposit?", "RENT", "SECURITY_DEPOSIT"),
    ("What is the license fee and what is the security deposit?", "LICENSE_FEE", "SECURITY_DEPOSIT"),
    ("When does the employee join and what is the probation period?", "JOINING_DATE", "PROBATION_PERIOD"),
    ("What is the agreement term and how long does confidentiality survive?", "TERM", "CONFIDENTIALITY_PERIOD"),
    ("What is the carpet area and when is possession due?", "CARPET_AREA", "POSSESSION_DATE"),
]


def _first(rec: dict, label: str):
    return next((m for m in rec["entities"] if m["label"] == label), None)


def _ev(m: dict) -> dict:
    return {"mention": m["id"], "start": m["start"], "end": m["end"], "text": m["text"]}


def build_questions(rec: dict, question_labels: list[str], rng) -> list[dict]:
    qs = []

    def add(kind, question, answer, normalized, evidence, **extra):
        qs.append({"qid": f"{rec['doc_id']}_q{len(qs)}", "doc_id": rec["doc_id"], "domain": rec["domain"],
                   "type": kind, "question": question, "expected_answer": answer,
                   "expected_normalized": normalized, "evidence": evidence, **extra})

    present = {m["label"] for m in rec["entities"]}
    contradicted = {m["label"] for x in rec["consistency_expectations"] if x["expected_result"] == "FLAG"
                    for m in rec["entities"] if m["id"] in {e["mention"] for e in x["expected_evidence"]}}

    # factual: one per present label (contradicted facts have no single answer)
    for label in question_labels:
        m = _first(rec, label)
        if m and label not in contradicted and label in QUESTION_TEXT:
            if m["core_type"] == "PARTY":
                answers = sorted({x["text"] for x in rec["entities"] if x["label"] == label})
                add("factual", QUESTION_TEXT[label], " and ".join(answers), None, [_ev(m)])
            else:
                add("factual", QUESTION_TEXT[label], m["text"], m["normalized"], [_ev(m)])

    # unanswerable: a field of this domain the document lacks, and one from another domain
    absent = [label for label in question_labels if label not in present and label in QUESTION_TEXT]
    if absent:
        label = rng.choice(absent)
        add("unanswerable", QUESTION_TEXT[label], "NOT_SUFFICIENT", None, [], probe_label=label)
    foreign = [label for label in FOREIGN_PROBES if label not in present and label not in question_labels]
    if foreign:
        label = rng.choice(foreign)
        add("unanswerable", QUESTION_TEXT[label], "NOT_SUFFICIENT", None, [], probe_label=label)

    # cross-clause
    for question, a, b in CROSS_CLAUSE:
        ma, mb = _first(rec, a), _first(rec, b)
        if ma and mb and ma["clause_id"] != mb["clause_id"] and not ({a, b} & contradicted):
            add("cross_clause", question, f"{ma['text']}; {mb['text']}", [ma["normalized"], mb["normalized"]],
                [_ev(ma), _ev(mb)])

    # multi-hop arithmetic
    for question, total_label, part_label in MULTI_HOP:
        mt, mp = _first(rec, total_label), _first(rec, part_label)
        if mt and mp and not ({total_label, part_label} & contradicted) and rec["domain"] in ("sale_property", "builder_buyer"):
            if total_label == "SALE_CONSIDERATION" and part_label == "ADVANCE_AMOUNT" and rec["domain"] != "sale_property":
                continue
            if part_label == "BOOKING_AMOUNT" and rec["domain"] != "builder_buyer":
                continue
            value = mt["normalized"]["amount"] - mp["normalized"]["amount"]
            add("multi_hop", question, f"INR {value:,}", {"amount": value, "currency": "INR"}, [_ev(mt), _ev(mp)])

    # contradiction (adversarial and control documents)
    for x in rec["consistency_expectations"]:
        label = next((m["label"] for m in rec["entities"] if m["id"] == x["expected_evidence"][0]["mention"]), None)
        name = "the " + (label or "term").replace("_", " ").lower()
        flagged = x["expected_result"] == "FLAG"
        add("contradiction", f"Is {name} stated consistently throughout the document?", "NO" if flagged else "YES",
            None, x["expected_evidence"], rule_id=x["rule_id"])
    return qs
