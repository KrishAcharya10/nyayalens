"""nda_msa: one-way / mutual NDAs and service / master service agreements."""

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import dispute_clause, execution_line, jurisdiction_clause, parties, random_dates, signatures, title
from ..core import DocBuilder, Ent, date_ent, duration, money, party, textual

DOMAIN = "nda_msa"
DOCUMENT_TYPES = [("NDA", 0.3), ("MUTUAL_NDA", 0.2), ("SERVICE_AGREEMENT", 0.25), ("MSA", 0.25)]
REQUIRED_LABELS: list = []  # depends on document type - see required_labels()

ADVERSARIAL = {
    "CONFIDENTIALITY_PERIOD_CONTRADICTION": "DURATION_CONTRADICTION",
    "PARTY_NAME_CONTRADICTION": "PARTY_NAME_CONTRADICTION",
    "TERMINATION_NOTICE_CONTRADICTION": "DURATION_CONTRADICTION",
    "DEFINITION_INCONSISTENCY": "DEFINITION_INCONSISTENCY",
}
REQUIRES = {"PARTY_NAME_CONTRADICTION": ("NDA", "SERVICE_AGREEMENT", "MSA")}
COUNTERFACTUALS = {
    "conf_years": lambda v: v + rng.choice([1, 2]),
    "fee": lambda v: v + rng.choice([25_000, 50_000, 100_000]),
    "notice_days": lambda v: {15: 30, 30: 60, 60: 90, 90: 30}[v],
}
# counterfactual -> document types where the edited fact exists
COUNTERFACTUAL_REQUIRES = {"fee": ("SERVICE_AGREEMENT", "MSA")}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"conf_years": {"CONFIDENTIALITY_PERIOD"}, "fee": {"FEE", "LIABILITY_CAP"}, "notice_days": {"TERMINATION_NOTICE"}}
QUESTION_LABELS = ["DISCLOSING_PARTY", "RECEIVING_PARTY", "CLIENT", "SERVICE_PROVIDER", "CONFIDENTIAL_INFORMATION",
                   "CONFIDENTIALITY_PERIOD", "TERM", "PURPOSE", "SERVICE", "FEE", "PAYMENT_TERM", "LIABILITY_CAP",
                   "EFFECTIVE_DATE", "TERMINATION_NOTICE", "JURISDICTION"]


def required_labels(document_type: str) -> list[str]:
    if document_type == "NDA":
        return ["DISCLOSING_PARTY", "RECEIVING_PARTY", "CONFIDENTIAL_INFORMATION", "CONFIDENTIALITY_PERIOD"]
    if document_type == "MUTUAL_NDA":
        return ["CONTRACTING_PARTY", "CONFIDENTIAL_INFORMATION", "CONFIDENTIALITY_PERIOD"]
    return ["CLIENT", "SERVICE_PROVIDER", "SERVICE", "FEE"]


SERVICES = ["software development and maintenance services", "digital marketing services",
            "payroll processing and HR outsourcing services", "cloud infrastructure management services",
            "content writing and translation services", "statutory audit support services"]
PURPOSES = ["evaluating a potential business collaboration", "discussing a possible joint venture",
            "assessing a proposed technology licensing arrangement", "evaluating a vendor relationship"]
DEFINITIONS = [
    "all business, technical, financial and commercial information disclosed in any form, whether oral, written or electronic",
    "all non-public information, including know-how, source code, customer lists and pricing, disclosed by one party to the other",
    "any information marked or identified as confidential at the time of disclosure, and any information that a reasonable person would consider confidential",
]


def build(b: DocBuilder) -> dict:
    dt = b.document_type
    is_nda, mutual = dt in ("NDA", "MUTUAL_NDA"), dt == "MUTUAL_NDA"
    loc = vp.random_location()
    first = vp.random_company()
    second = vp.random_company() if (is_nda or b.chance(0.75)) else vp.random_person()
    effective = random_dates(b)
    term_years = rng.choice([1, 2, 3])
    conf_years = b.val("conf_years", lambda: rng.choice([2, 3, 5]))
    notice_days = b.val("notice_days", lambda: rng.choice([15, 30, 30, 60, 90]))
    fee = b.val("fee", lambda: rng.randrange(50_000, 1_500_000, 5_000))
    payment_days = rng.choice([15, 30, 45])
    cap = int(round(fee * rng.choice([6, 12]), -3))
    definition = rng.choice(DEFINITIONS)

    alt_conf = conf_years + rng.choice([1, 2])
    alt_notice = {15: 30, 30: 60, 60: 90, 90: 60}[notice_days]
    alt_party = vp.random_company()["name"]
    narrow_definition = "only information that is marked \"Confidential\" in writing at the time of disclosure"
    restate = b.chance(b.profile["restate"])
    unfair = rng.choice(["UNCAPPED_LIABILITY", "ONE_SIDED_REMEDY", None, None] if not is_nda else ["ASYMMETRIC_OBLIGATION", None, None, None])
    if not b.chance(0.45) or (unfair == "ASYMMETRIC_OBLIGATION" and not mutual):
        unfair = None
    if b.inject:
        unfair = None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    if is_nda:
        title(b, "nda", ["MUTUAL NON-DISCLOSURE AGREEMENT", "MUTUAL CONFIDENTIALITY AGREEMENT"] if mutual
              else ["NON-DISCLOSURE AGREEMENT", "CONFIDENTIALITY AGREEMENT", "UNILATERAL NON-DISCLOSURE AGREEMENT"])
    else:
        title(b, "msa", ["MASTER SERVICES AGREEMENT", "MASTER SERVICE AGREEMENT"] if dt == "MSA"
              else ["SERVICE AGREEMENT", "PROFESSIONAL SERVICES AGREEMENT", "CONSULTING SERVICES AGREEMENT"])
    execution_line(b, "nda", loc, effective, "EFFECTIVE_DATE", "Agreement")
    b.relation("EFFECTIVE_FROM", "DOCUMENT", "instrument_date")

    if mutual:
        roles = (("CONTRACTING_PARTY", "party_a", "First Party", first), ("CONTRACTING_PARTY", "party_b", "Second Party", second))
    elif is_nda:
        roles = (("DISCLOSING_PARTY", "discloser", "Disclosing Party", first), ("RECEIVING_PARTY", "recipient", b.term("Receiving Party", ["Recipient"]), second))
    else:
        roles = (("CLIENT", "client", b.term("Client", ["Customer"]), first), ("SERVICE_PROVIDER", "provider", b.term("Service Provider", ["Consultant", "Contractor"]), second))
    parties(b, *roles)
    T1, T2 = roles[0][2], roles[1][2]
    k1, k2 = roles[0][1], roles[1][1]

    if is_nda:
        b.emit("WHEREAS the parties wish to exchange certain confidential information for the purpose of {p} (\"the Purpose\");\n\nNOW THEREFORE the parties agree as follows:\n\n",
               p=textual(rng.choice(PURPOSES), "PURPOSE", "purpose"))
        b.relation("HAS_PURPOSE", "DOCUMENT", "purpose")
    else:
        b.emit("WHEREAS the {t1} wishes to engage the {t2} to provide {s}, and the {t2} has agreed to do so on the terms below;\n\n",
               t1=T1, t2=T2, s=textual(rng.choice(SERVICES), "SERVICE", "service"))
        b.relation("PROVIDES", "provider", "service")

    with b.clause("DEFINITIONS", "nda.def", ["DEFINITIONS", "DEFINITION OF CONFIDENTIAL INFORMATION", "INTERPRETATION"]):
        b.emit("\"Confidential Information\" means {ci}.", ci=textual(definition, "CONFIDENTIAL_INFORMATION", "ci"))
    if mutual:
        b.relation("PROTECTS", "party_a", "ci")
        b.relation("PROTECTS", "party_b", "ci")
    elif is_nda:
        b.relation("DISCLOSES", "discloser", "ci")
        b.relation("RECEIVES", "recipient", "ci")
        b.relation("PROTECTS", "recipient", "ci")

    if not is_nda:
        deliverable = textual(rng.choice(["monthly progress reports", "the software modules listed in Schedule 1",
                                          "a final report at the end of each quarter"]), "DELIVERABLE", "deliverable")
        inline_deliverable = b.chance(0.6)
        with b.clause("SCOPE_OF_SERVICES", "msa.scope", ["SCOPE OF SERVICES", "SERVICES", "SCOPE OF WORK"]):
            if inline_deliverable:
                b.ob("The {t2} shall provide the services described in the Statement of Work with due skill and care, and shall deliver {d}.",
                     actor="provider", action="PROVIDE_SERVICES", t2=T2, d=deliverable)
            else:
                b.ob("The {t2} shall provide the services described in the Statement of Work with due skill and care.",
                     actor="provider", action="PROVIDE_SERVICES", t2=T2)
        if not inline_deliverable:
            with b.clause("DELIVERABLES", "msa.deliv", ["DELIVERABLES", "MILESTONES AND DELIVERABLES"]):
                b.emit("The {t2} shall deliver {d} in accordance with the agreed timelines.", t2=T2, d=deliverable)
        b.relation("DELIVERS", "provider", "deliverable")
        with b.clause("FEES", "msa.fees", ["FEES", "CONSIDERATION", "COMMERCIAL TERMS"]):
            b.emit("In consideration of the services, the {t1} shall pay the {t2} a fee of {f} per month, exclusive of GST.",
                   t1=T1, t2=T2, f=money(fee, "FEE", "fee", b.currency))
            b.relation("PAYS", "client", "fee")
        with b.clause("PAYMENT_TERMS", "msa.pay", ["PAYMENT TERMS", "INVOICING AND PAYMENT", "PAYMENT"]):
            b.ob("The {t1} shall pay each undisputed invoice within {pt} of its receipt.",
                 actor="client", action="PAY", purpose="FEE", t1=T1,
                 pt=duration(payment_days, "day", "PAYMENT_TERM", "payment_term", plain=True))
            b.relation("HAS_PAYMENT_TERM", "DOCUMENT", "payment_term")

    if is_nda and b.optional(0.4):
        with b.clause("PURPOSE", "nda.purpose", ["PURPOSE", "PERMITTED USE"]):
            b.t("Confidential Information shall be used solely for the Purpose and for no other purpose whatsoever.")
    with b.clause("CONFIDENTIALITY", "nda.conf", ["CONFIDENTIALITY", "OBLIGATIONS OF CONFIDENTIALITY", "NON-DISCLOSURE"]):
        if mutual and unfair == "ASYMMETRIC_OBLIGATION":
            b.risk("ASYMMETRIC_OBLIGATION", "one_way_obligations_in_mutual_nda")
            b.ob("The {t2} shall hold all Confidential Information in strict confidence and use it only for the Purpose. ",
                 actor="party_b", action="PROTECT_CONFIDENTIAL", t2=T2)
            b.emit("The {t1} shall be free to use any information received from the {t2} for its own business.", t1=T1, t2=T2)
        elif mutual:
            b.ob("Each party shall hold the other party's Confidential Information in strict confidence and use it only for the Purpose.",
                 actor="party_a", action="PROTECT_CONFIDENTIAL")
        else:
            actor = "recipient" if is_nda else "provider"
            b.ob("The {t} shall hold all Confidential Information in strict confidence, shall not disclose it to any third party, and shall use it only for the purposes of this Agreement.",
                 actor=actor, action="PROTECT_CONFIDENTIAL", t=T2)
        if involved("DEFINITION_INCONSISTENCY"):
            scope = narrow_definition if active("DEFINITION_INCONSISTENCY") else definition
            b.emit(" For the purposes of this clause, \"Confidential Information\" means {ci2}.",
                   ci2=textual(scope, "CONFIDENTIAL_INFORMATION", "ci"))
    if involved("DEFINITION_INCONSISTENCY"):
        b.expect("DEFINITION_INCONSISTENCY", "nda_definition_single", ["ci"])

    if is_nda:
        with b.clause("EXCLUSIONS", "nda.excl", ["EXCLUSIONS", "EXCEPTIONS"]):
            b.emit("Confidential Information does not include information that is or becomes public through no fault of the receiving party, or that was lawfully known to it before disclosure.")
        if b.optional(0.6):
            with b.clause("RETURN_OF_INFORMATION", "nda.ret", ["RETURN OF INFORMATION", "RETURN OR DESTRUCTION"]):
                b.ob("On written request, the {t} shall return or destroy all Confidential Information within fifteen days.",
                     actor="party_b" if mutual else "recipient", action="RETURN_INFORMATION", t=T2)
    else:
        if b.optional(0.7):
            with b.clause("INTELLECTUAL_PROPERTY", "msa.ip", ["INTELLECTUAL PROPERTY", "OWNERSHIP OF DELIVERABLES"]):
                b.emit("{ip} shall vest in the {t1} upon payment.", t1=T1, ip=textual(
                    rng.choice(["All intellectual property in the deliverables", "All rights in the work product created under this Agreement"]),
                    "INTELLECTUAL_PROPERTY", "ip"))
                b.relation("OWNS", "client", "ip")
        if b.optional(0.5):
            with b.clause("DATA_PROTECTION", "msa.data", ["DATA PROTECTION", "PRIVACY AND DATA SECURITY"]):
                b.emit("The {t2} shall process {data} only on the {t1}'s documented instructions. ", t1=T1, t2=T2,
                       data=textual(rng.choice(["personal data of the Client's customers", "employee personal data shared by the Client"]), "DATA", "data"))
                b.ob("The {t2} shall notify the {t1} of any data breach within seventy-two hours of becoming aware of it.",
                     actor="provider", action="NOTIFY_BREACH", t1=T1, t2=T2)
        if b.optional(0.4):
            with b.clause("WARRANTIES", "msa.warr", ["WARRANTIES", "SERVICE WARRANTY"]):
                b.emit("The {t2} warrants that the deliverables will be free from material defects for {wp} from acceptance.",
                       t2=T2, wp=duration(rng.choice([30, 60, 90]), "day", "WARRANTY_PERIOD", "warranty", plain=True))
        with b.clause("LIMITATION_OF_LIABILITY", "msa.liab", ["LIMITATION OF LIABILITY", "LIABILITY"]):
            if unfair == "UNCAPPED_LIABILITY":
                b.risk("UNCAPPED_LIABILITY", "one_sided_uncapped_liability")
                b.emit("The {t1}'s total liability shall not exceed {cap}, whereas the liability of the {t2} under this Agreement shall be unlimited.",
                       t1=T1, t2=T2, cap=money(cap, "LIABILITY_CAP", "cap", b.currency, words=False))
            else:
                b.emit("Neither party's aggregate liability under this Agreement shall exceed {cap}, except for breach of confidentiality.",
                       cap=money(cap, "LIABILITY_CAP", "cap", b.currency, words=False))
            b.relation("HAS_LIABILITY_CAP", "DOCUMENT", "cap")
        if b.optional(0.5):
            with b.clause("INDEMNITY", "msa.indem", ["INDEMNITY", "INDEMNIFICATION"]):
                b.ob("The {t2} shall indemnify the {t1} against third-party claims arising from the {t2}'s negligence or wilful misconduct.",
                     actor="provider", action="INDEMNIFY", t1=T1, t2=T2)

    survival_text = "The obligations of confidentiality shall survive for {cp} after the expiry or termination of this Agreement."
    separate_survival = b.chance(0.4)
    with b.clause("TERM", "nda.term", ["TERM", "DURATION", "TERM AND SURVIVAL"]):
        b.emit("This Agreement shall remain in force for {term} from the Effective Date. ",
               term=duration(term_years, "year", "TERM", "term"))
        b.relation("HAS_TERM", "DOCUMENT", "term")
        if not separate_survival:
            b.emit(survival_text, cp=duration(conf_years, "year", "CONFIDENTIALITY_PERIOD", "conf_period"))
    if separate_survival:
        with b.clause("CONFIDENTIALITY_PERIOD", "nda.surv", ["SURVIVAL", "SURVIVAL OF OBLIGATIONS"]):
            b.emit(survival_text, cp=duration(conf_years, "year", "CONFIDENTIALITY_PERIOD", "conf_period"))
    b.relation("CONFIDENTIAL_FOR", "DOCUMENT", "conf_period")

    with b.clause("TERMINATION", "nda.termin", ["TERMINATION", "TERMINATION OF AGREEMENT"]):
        if unfair == "ONE_SIDED_REMEDY":
            b.risk("ONE_SIDED_REMEDY", "termination_for_convenience_one_side")
            b.emit("The {t1} may terminate this Agreement at any time for convenience by giving {n} notice; the {t2} may terminate only for the {t1}'s uncured material breach.",
                   t1=T1, t2=T2, n=duration(notice_days, "day", "TERMINATION_NOTICE", "notice", plain=True))
        else:
            b.emit("Either party may terminate this Agreement by giving {n} written notice to the other.",
                   n=duration(notice_days, "day", "TERMINATION_NOTICE", "notice", plain=True))
        b.relation("HAS_TERMINATION_NOTICE", "DOCUMENT", "notice")
        if involved("CONFIDENTIALITY_PERIOD_CONTRADICTION") or restate:
            c2 = alt_conf if active("CONFIDENTIALITY_PERIOD_CONTRADICTION") else conf_years
            b.emit(" Notwithstanding termination, Confidential Information shall be protected for {c2}" + b.cross_ref("TERM", " in accordance with Clause {n}") + ".",
                   c2=duration(c2, "year", "CONFIDENTIALITY_PERIOD", "conf_period"))
        if involved("TERMINATION_NOTICE_CONTRADICTION"):
            n2 = alt_notice if active("TERMINATION_NOTICE_CONTRADICTION") else notice_days
            b.emit(" Any notice of termination must be served at least {n2} before the intended date of termination.",
                   n2=duration(n2, "day", "TERMINATION_NOTICE", "notice", plain=True))
    if involved("CONFIDENTIALITY_PERIOD_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "nda_conf_period_single", ["conf_period"])
    if involved("TERMINATION_NOTICE_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "nda_termination_notice_single", ["notice"])

    if b.optional(0.25):
        with b.clause("NON_SOLICITATION", "nda.nonsolicit", ["NON-SOLICITATION", "NON SOLICITATION OF EMPLOYEES"]):
            b.t("During the term and for twelve months thereafter, neither party shall solicit for employment any "
                "employee of the other party who was involved in this engagement.")
    if b.optional(0.6):
        dispute_clause(b, "nda", loc, "Agreement")
    jurisdiction_clause(b, "nda", loc, "Agreement")

    b.t("\n")
    sign_names = [roles[0][3]["name"], roles[1][3]["name"]]
    if active("PARTY_NAME_CONTRADICTION"):
        sign_names[1] = alt_party
    b.t("IN WITNESS WHEREOF, the parties have executed this Agreement through their authorised representatives.\n\n")
    for (label, key, term_word, _), name in zip(roles, sign_names):
        b.t(f"For and on behalf of the {term_word}\n")
        b.e(party(name, label, key))
        b.t("\nAuthorised Signatory\n\n")
    if b.chance(0.3):
        b.t("WITNESSES:\n")
        for i in (1, 2):
            b.t(f"{i}. ")
            b.e(Ent(vp.random_person()["name"], "WITNESS", f"witness_{i}", {"value": None}))
            b.t("\n")
    if involved("PARTY_NAME_CONTRADICTION"):
        rule = {"RECEIVING_PARTY": "nda_recipient_single", "SERVICE_PROVIDER": "msa_provider_single"}[roles[1][0]]
        b.expect("PARTY_NAME_CONTRADICTION", rule, [k2])
    return {"city": loc["city"], "state": loc["state"]}
