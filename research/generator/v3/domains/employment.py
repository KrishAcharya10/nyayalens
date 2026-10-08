"""employment: employment contracts, offer letters, appointment letters."""

from datetime import timedelta

import value_pools_v2 as vp
from value_pools_v2 import rng

from ..common import business_address, dispute_clause, jurisdiction_clause, random_dates, title
from ..core import DocBuilder, Ent, add_months, date_ent, duration, money, party, textual

DOMAIN = "employment"
DOCUMENT_TYPES = [("EMPLOYMENT_CONTRACT", 0.4), ("OFFER_LETTER", 0.35), ("APPOINTMENT_LETTER", 0.25)]
REQUIRED_LABELS = ["EMPLOYER", "EMPLOYEE", "JOB_TITLE", "CTC", "JOINING_DATE"]

ADVERSARIAL = {
    "SALARY_CONTRADICTION": "FINANCIAL_CONTRADICTION",
    "NOTICE_PERIOD_CONTRADICTION": "DURATION_CONTRADICTION",
    "JOINING_DATE_CONTRADICTION": "DATE_CONTRADICTION",
    "ROLE_CONFUSION": "PARTY_ROLE_INCONSISTENCY",
}
REQUIRES: dict = {}
COUNTERFACTUALS = {
    "ctc": lambda v: v + rng.choice([1, 2, 3]) * 100_000,
    "notice_days": lambda v: {30: 60, 60: 90, 90: 30}[v],
    "probation_months": lambda v: {3: 6, 6: 3}[v],
}
# counterfactual -> the only labels its edit may change (the fact plus values derived from it)
COUNTERFACTUAL_EFFECTS = {"ctc": {"CTC", "SALARY", "BASE_SALARY", "BONUS"}, "notice_days": {"NOTICE_PERIOD"}, "probation_months": {"PROBATION_PERIOD"}}
QUESTION_LABELS = ["EMPLOYER", "EMPLOYEE", "JOB_TITLE", "CTC", "SALARY", "JOINING_DATE", "PROBATION_PERIOD",
                   "NOTICE_PERIOD", "WORK_LOCATION", "LEAVE_ENTITLEMENT", "WORKING_HOURS", "NON_COMPETE_PERIOD"]

TITLES = ["Software Engineer", "Senior Software Engineer", "Data Analyst", "Associate Consultant", "Sales Executive",
          "Marketing Manager", "Accounts Executive", "HR Business Partner", "Product Manager", "Customer Support Associate",
          "Business Development Manager", "Quality Analyst"]


def build(b: DocBuilder) -> dict:
    letter = b.document_type in ("OFFER_LETTER", "APPOINTMENT_LETTER")
    loc = vp.random_location()
    company = vp.random_company()
    person = vp.random_person()
    executed = random_dates(b)
    joining = executed + timedelta(days=rng.randint(10, 60))
    job = rng.choice(TITLES)
    ctc = b.val("ctc", lambda: rng.randrange(300_000, 4_500_000, 10_000))
    salary = int(round(ctc * rng.uniform(0.07, 0.08), -2))
    basic = int(round(salary * rng.choice([0.4, 0.45, 0.5]), -2))
    bonus = int(round(ctc * rng.choice([0.05, 0.1]), -3)) if b.chance(0.4) else None
    probation_months = b.val("probation_months", lambda: rng.choice([3, 6]))
    notice_days = b.val("notice_days", lambda: rng.choice([30, 60, 90]))
    leave_days = rng.choice([18, 21, 24, 30])
    hours = rng.choice(["9:30 a.m. to 6:30 p.m., Monday to Friday", "45 hours per week", "10:00 a.m. to 7:00 p.m. on working days"])
    fixed_term = b.document_type == "EMPLOYMENT_CONTRACT" and b.chance(0.25)
    term_end = add_months(joining, rng.choice([12, 24, 36]))

    alt_ctc = ctc + rng.choice([50_000, 100_000, 200_000])
    alt_notice = {30: 60, 60: 90, 90: 60}[notice_days]
    alt_joining = joining + timedelta(days=rng.choice([7, 14, 30]))
    restate = b.chance(b.profile["restate"])
    unfair = rng.choice(["RESTRICTIVE_COVENANT", "ASYMMETRIC_OBLIGATION", None, None])
    if not b.chance(0.4) or b.document_type == "OFFER_LETTER":
        unfair = None
    if b.inject:
        unfair = None

    def active(k): return b.inject == k and b.inject_active
    def involved(k): return b.inject == k

    E = "you" if letter else "the Employee"
    Ecap = "You" if letter else "The Employee"
    C = "the Company"
    Ccap = "The Company"

    # --- opening ---------------------------------------------------------------
    if letter:
        b.e(party(company["name"], "EMPLOYER", "employer"))
        b.t(f"\n{business_address(loc)}\n\nDate: ")
        b.e(date_ent(executed, "EXECUTION_DATE", "instrument_date", b.date_style))
        b.t(f"\n\nTo,\n{person['honorific']} ")
        b.e(party(person["name"], "EMPLOYEE", "employee"))
        b.t(f"\n{vp.random_property_address(vp.random_location())}\n\n")
        if b.generic_title:
            title(b, "emp", [])
        else:
            b.t(b.pick("emp.subject", ["Subject: Offer of Employment", "Subject: Letter of Appointment", "Sub: Appointment as {}"]).format(job) + "\n\n")
        b.t(f"Dear {person['name'].split()[0]},\n\n")
        b.emit(b.pick("emp.open", [
            "We are pleased to offer you the position of {job} with {co}, on the terms set out below.\n\n",
            "With reference to your application and the subsequent interviews, we are pleased to appoint you as {job} on the following terms and conditions.\n\n",
            "Further to our discussions, {co} is delighted to offer you employment as {job}.\n\n",
        ]), job=textual(job, "JOB_TITLE", "job"), co="the Company")
    else:
        title(b, "emp", ["EMPLOYMENT AGREEMENT", "EMPLOYMENT CONTRACT", "CONTRACT OF EMPLOYMENT"])
        b.t("This Employment Agreement is made on ")
        b.e(date_ent(executed, "EXECUTION_DATE", "instrument_date", b.date_style))
        b.t(" between:\n\n")
        b.t("M/s. ")
        b.e(party(company["name"], "EMPLOYER", "employer"))
        b.t(f', a company incorporated under the Companies Act, 2013, having its registered office at {business_address(loc)}, hereinafter referred to as the "COMPANY" (which expression shall include its successors and assigns) of the ONE PART;\n\nAND\n\n')
        b.t(f"{person['honorific']} ")
        b.e(party(person["name"], "EMPLOYEE", "employee"))
        b.t(f', aged about {person["age"] if person["age"] < 60 else 34} years, residing at {vp.random_property_address(vp.random_location())}, hereinafter referred to as the "EMPLOYEE" of the OTHER PART.\n\n')
    b.relation("EMPLOYED_BY", "employee", "employer")

    # --- position / commencement ----------------------------------------------------
    with b.clause("POSITION", "emp.pos", ["POSITION", "DESIGNATION", "APPOINTMENT", "ROLE AND RESPONSIBILITIES"]):
        if letter:
            b.emit("You will be designated as {job} and will be based at our office in {loc}.",
                   job=textual(job, "JOB_TITLE", "job"), loc=Ent(loc["city"], "WORK_LOCATION", "location", {"value": loc["city"]}))
        else:
            b.emit("The Company appoints the Employee as {job}, and the Employee shall be based at {loc} or such other location as the Company may reasonably require.",
                   job=textual(job, "JOB_TITLE", "job"), loc=Ent(loc["city"], "WORK_LOCATION", "location", {"value": loc["city"]}))
        b.relation("HAS_ROLE", "employee", "job")
        b.relation("WORKS_AT", "employee", "location")

    with b.clause("COMMENCEMENT", "emp.join", ["COMMENCEMENT", "DATE OF JOINING", "JOINING"]):
        b.ob(f"{Ecap} shall join duty on or before {{jd}}, failing which this {'offer' if b.document_type == 'OFFER_LETTER' else 'appointment'} may be withdrawn.",
             actor="employee", action="JOIN", deadline="joining", jd=date_ent(joining, "JOINING_DATE", "joining", b.date_style))
        b.relation("STARTS_ON", "employee", "joining")
        if fixed_term:
            b.emit(" This employment is for a fixed term ending on {te}.", te=date_ent(term_end, "EXPIRY_DATE", "term_end", b.date_style))
            b.relation("TERMINATES_ON", "DOCUMENT", "term_end")

    # --- compensation ------------------------------------------------------------------
    with b.clause("COMPENSATION", "emp.comp", ["COMPENSATION", "REMUNERATION", "SALARY AND BENEFITS", "EMOLUMENTS"]):
        b.emit(f"{Ecap}{' will be' if letter else ' shall be'} entitled to an annual cost to company (CTC) of {{ctc}}. ",
               ctc=money(ctc, "CTC", "ctc", b.currency))
        b.relation("RECEIVES_SALARY", "employee", "ctc")
        reversal = active("ROLE_CONFUSION")
        payer = Ecap if reversal else Ccap
        payee = "the Company" if reversal else E
        b.ob(f"{payer} shall pay {payee} a monthly gross salary of {{sal}}, of which the basic salary is {{basic}}, on the last working day of each month.",
             actor="employee" if reversal else "employer", action="PAY_SALARY", amount="salary", frequency="MONTHLY",
             role_reversal=reversal, sal=money(salary, "SALARY", "salary", b.currency, words=False),
             basic=money(basic, "BASE_SALARY", "basic", b.currency, words=False))
        b.relation("RECEIVES_SALARY", "employee", "salary")
        b.relation("RECEIVES_SALARY", "employee", "basic")
        if bonus:
            b.emit(" In addition, a performance bonus of up to {bonus} per year may be paid at the Company's discretion.",
                   bonus=money(bonus, "BONUS", "bonus", b.currency, words=False))
            b.relation("RECEIVES_BONUS", "employee", "bonus")
    if involved("ROLE_CONFUSION"):
        b.expect("PARTY_ROLE_INCONSISTENCY", "emp_salary_payer", ["salary"])

    if b.document_type != "OFFER_LETTER" or b.chance(0.6):
        with b.clause("PROBATION", "emp.prob", ["PROBATION", "PROBATION PERIOD"]):
            b.emit(f"{Ecap} shall be on probation for {{pp}} from the date of joining, which may be extended at the Company's discretion.",
                   pp=duration(probation_months, "month", "PROBATION_PERIOD", "probation"))
            b.relation("HAS_PROBATION", "employee", "probation")

    if b.optional(0.3):
        with b.clause("PLACE_OF_WORK", "emp.place", ["PLACE OF WORK", "TRANSFER"]):
            b.t(f"{Ecap} may be transferred to any office, branch or client site of the Company in India, as business needs require.")
    if b.optional(0.6):
        with b.clause("WORKING_HOURS", "emp.hours", ["WORKING HOURS", "HOURS OF WORK"]):
            b.emit("The normal working hours shall be {h}.", h=textual(hours, "WORKING_HOURS", "hours"))
    if b.optional(0.6):
        with b.clause("LEAVE", "emp.leave", ["LEAVE", "LEAVE AND HOLIDAYS"]):
            b.emit(f"{Ecap} shall be entitled to {{lv}} of paid leave in each calendar year, in addition to public holidays.",
                   lv=duration(leave_days, "day", "LEAVE_ENTITLEMENT", "leave", plain=True))
            b.relation("HAS_LEAVE", "employee", "leave")
    if b.optional(0.5):
        with b.clause("BENEFITS", "emp.benefits", ["BENEFITS", "INSURANCE AND BENEFITS"]):
            b.emit(f"{Ecap} shall be covered under {{ben}}.", ben=textual(rng.choice([
                "the Company's group medical insurance policy for self and family",
                "group term life insurance and the Company's medical insurance scheme",
                "the provident fund and gratuity schemes applicable under law"]), "BENEFITS", "benefits"))

    # --- confidentiality / IP ---------------------------------------------------------------
    if b.document_type == "EMPLOYMENT_CONTRACT" or b.optional(0.5):
        with b.clause("CONFIDENTIALITY", "emp.conf", ["CONFIDENTIALITY", "CONFIDENTIAL INFORMATION"]):
            b.ob(f"{Ecap} shall keep confidential {{ci}}, both during and after employment.",
                 actor="employee", action="PROTECT_CONFIDENTIAL", ci=textual(rng.choice([
                     "all business, technical and financial information of the Company",
                     "all information relating to the Company's clients, pricing and products",
                     "all trade secrets, source code and customer data of the Company"]), "CONFIDENTIAL_INFORMATION", "ci"))
            b.relation("MUST_PROTECT", "employee", "ci")
    if b.document_type == "EMPLOYMENT_CONTRACT" or b.optional(0.3):
        with b.clause("INTELLECTUAL_PROPERTY", "emp.ip", ["INTELLECTUAL PROPERTY", "INVENTIONS", "OWNERSHIP OF WORK PRODUCT"]):
            b.emit("{ip} shall be the exclusive property of the Company. ", ip=textual(rng.choice([
                f"All inventions, software and works created by {'you' if letter else 'the Employee'} in the course of employment",
                "All work product, designs and improvements developed during employment"]), "INTELLECTUAL_PROPERTY", "ip"))
            b.relation("OWNS_IP", "employer", "ip")
            b.ob(f"{Ecap} shall execute all documents needed to assign such rights to the Company.",
                 actor="employee", action="ASSIGN_IP")

    if unfair == "RESTRICTIVE_COVENANT":
        with b.clause("NON_COMPETE", "emp.nc", ["NON-COMPETE", "RESTRICTIVE COVENANTS", "NON-COMPETITION"]):
            b.risk("RESTRICTIVE_COVENANT", "post_employment_non_compete")
            b.ob(f"For {{nc}} after leaving the Company for any reason, {E} shall not take up employment with any competitor or carry on any similar business anywhere in India.",
                 actor="employee", action="REFRAIN_FROM_COMPETING",
                 nc=duration(rng.choice([12, 24]), "month", "NON_COMPETE_PERIOD", "non_compete"))
            b.relation("RESTRICTED_FOR", "employee", "non_compete")

    if b.optional(0.35):
        with b.clause("CODE_OF_CONDUCT", "emp.conduct", ["CODE OF CONDUCT", "COMPANY POLICIES"]):
            b.t(f"{Ecap} shall comply with the Company's code of conduct and policies as amended from time to time.")

    # --- notice / termination ----------------------------------------------------------------
    with b.clause("NOTICE_PERIOD", "emp.notice", ["NOTICE PERIOD", "TERMINATION AND NOTICE", "NOTICE"]):
        if unfair == "ASYMMETRIC_OBLIGATION":
            b.risk("ASYMMETRIC_OBLIGATION", "asymmetric_notice")
            b.ob(f"{Ecap} shall give the Company {{n}} written notice before resigning. ",
                 actor="employee", action="SERVE_NOTICE", n=duration(90, "day", "NOTICE_PERIOD", "notice_employee", plain=True))
            b.emit("The Company may terminate the employment at any time without notice or payment in lieu of notice.")
        else:
            b.ob(f"After confirmation, {E} shall give {{n}} written notice to resign, ",
                 actor="employee", action="SERVE_NOTICE", n=duration(notice_days, "day", "NOTICE_PERIOD", "notice", plain=True))
            b.emit("and the Company shall likewise give the same notice, or salary in lieu thereof, to terminate the employment.")
            b.relation("HAS_NOTICE_PERIOD", "employee", "notice")

    with b.clause("TERMINATION", "emp.term", ["TERMINATION", "SEPARATION", "CESSATION OF EMPLOYMENT"]):
        b.ob(f"On leaving the Company, {E} shall return all Company property, including laptops, access cards and documents.",
             actor="employee", action="RETURN_PROPERTY")
        if (involved("NOTICE_PERIOD_CONTRADICTION") or restate) and unfair != "ASYMMETRIC_OBLIGATION":
            n2 = alt_notice if active("NOTICE_PERIOD_CONTRADICTION") else notice_days
            b.emit(f" A resignation shall be effective only after {E} completes a notice period of {{n2}}" + b.cross_ref("NOTICE_PERIOD", " under Clause {n}") + ".",
                   n2=duration(n2, "day", "NOTICE_PERIOD", "notice", plain=True))
    if involved("NOTICE_PERIOD_CONTRADICTION"):
        b.expect("DURATION_CONTRADICTION", "emp_notice_single", ["notice"])

    if b.document_type == "EMPLOYMENT_CONTRACT":
        if b.optional(0.4):
            dispute_clause(b, "emp", loc, "Agreement")
        jurisdiction_clause(b, "emp", loc, "Agreement")

    # --- annexure / acceptance ---------------------------------------------------------------------
    if involved("SALARY_CONTRADICTION") or b.chance(b.profile["annex"] * 0.6):
        b.t("\n")
        with b.section("COMPENSATION", "ANNEXURE A - COMPENSATION STRUCTURE"):
            c2 = alt_ctc if active("SALARY_CONTRADICTION") else ctc
            b.emit("Basic salary (monthly): {basic}\nTotal annual cost to company: {ctc}\n",
                   basic=money(basic, "BASE_SALARY", "basic", b.currency, words=False),
                   ctc=money(c2, "CTC", "ctc", b.currency, words=False))
    if involved("SALARY_CONTRADICTION"):
        b.expect("FINANCIAL_CONTRADICTION", "emp_ctc_single", ["ctc"])

    b.t("\n")
    if letter:
        b.t("Please sign and return a copy of this letter as a token of your acceptance.\n\nFor ")
        b.e(party(company["name"], "EMPLOYER", "employer"))
        b.t(f"\n\nAuthorised Signatory\n\nACCEPTANCE\nI accept the above terms")
        if involved("JOINING_DATE_CONTRADICTION") or restate:
            j2 = alt_joining if active("JOINING_DATE_CONTRADICTION") else joining
            b.emit(" and confirm that I will join on {j2}", j2=date_ent(j2, "JOINING_DATE", "joining", b.date_style))
        b.t(".\n\n(")
        b.e(party(person["name"], "EMPLOYEE", "employee"))
        b.t(")\n")
    else:
        if involved("JOINING_DATE_CONTRADICTION"):
            b.emit("The Employee confirms that the Employee will report for duty on {j2}.\n\n",
                   j2=date_ent(alt_joining if active("JOINING_DATE_CONTRADICTION") else joining, "JOINING_DATE", "joining", b.date_style))
        b.t("IN WITNESS WHEREOF the parties have signed this Agreement on the date first written above.\n\nFor ")
        b.e(party(company["name"], "EMPLOYER", "employer"))
        b.t("\nAuthorised Signatory\n\nEMPLOYEE\n(")
        b.e(party(person["name"], "EMPLOYEE", "employee"))
        b.t(")\n")
    if involved("JOINING_DATE_CONTRADICTION"):
        b.expect("DATE_CONTRADICTION", "emp_joining_single", ["joining"])
    return {"city": loc["city"], "state": loc["state"]}
