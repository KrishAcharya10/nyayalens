import { describe, expect, it } from "vitest";
import { analyseCanonicalText } from "../src/evaluation/analyseDocument.js";
import { ExtractiveLLMProvider } from "../src/rag/extractiveLlmProvider.js";
import { getActiveRetrievalProvider } from "../src/rag/retrievalProviderFactory.js";
import { askFromFacts } from "../src/rag/runAsk.js";

// One test per rule or bug fixed for Anomaly Benchmark v2, each with the case it must catch and
// the near-miss it must leave alone. Texts are fictional.
const run = (type: string, text: string) =>
  analyseCanonicalText(text, [{ pageNumber: 1, text }], "doc", type);
const rules = (a: ReturnType<typeof run>) => a.findings.map((f) => f.ruleId ?? f.category);
const ask = (a: ReturnType<typeof run>, question: string) =>
  askFromFacts({
    documentId: "doc",
    documentType: a.documentType,
    question,
    clauses: a.clauses,
    entities: a.entities,
    pages: a.pages,
    findings: a.findings.filter((f) => f.pass === "CONSISTENCY"),
    retrievalProvider: getActiveRetrievalProvider(),
    llmProvider: ExtractiveLLMProvider,
  });
const labels = (a: ReturnType<typeof run>, label: string) =>
  a.entities.filter((e) => e.label === label).map((e) => e.text);

describe("amount labelling", () => {
  it("does not carry one amount's label onto the next line of a schedule", () => {
    const a = run(
      "RESIDENTIAL_RENTAL",
      "SCHEDULE OF PAYMENTS\nMonthly Rent: INR 31,000\nSecurity Deposit: INR 57,000\nMaintenance charges: INR 1,500 per month\n",
    );
    expect(labels(a, "SECURITY_DEPOSIT")).toEqual(["INR 57,000"]);
    expect(labels(a, "RENT")).toEqual(["INR 31,000"]);
  });

  it("uses the keyword nearest the amount (premium then rent in one sentence)", () => {
    const a = run(
      "LAND_LEASE",
      "3. PREMIUM AND RENT\nThe Lessee shall pay a premium of INR 3,00,000 on signing, and an annual rent of INR 2,10,000 each year.\n",
    );
    expect(labels(a, "LEASE_PREMIUM")).toEqual(["INR 3,00,000"]);
    expect(labels(a, "RENT")).toEqual(["INR 2,10,000"]);
  });

  it("does not read later amounts in a sentence as the advance", () => {
    const a = run(
      "SALE_DEED",
      "2. CONSIDERATION\nThe Vendor acknowledges receipt of INR 9,00,000 earlier as advance and INR 63,00,000 today, making INR 72,00,000 in full.\n",
    );
    expect(labels(a, "ADVANCE_AMOUNT")).toEqual(["INR 9,00,000"]);
    expect(a.findings.map((f) => f.ruleId)).not.toContain("sale_advance_single");
  });

  it("leaves a sentence comma out of the amount", () => {
    const a = run(
      "RESIDENTIAL_RENTAL",
      "3. RENT\nThe Tenant shall pay monthly rent of INR 28,500, due on the 7th of each month.\n",
    );
    expect(labels(a, "RENT")).toEqual(["INR 28,500"]);
  });

  it("labels each CTC component separately", () => {
    const a = run(
      "OFFER_LETTER",
      "Your annual cost to the Company (CTC) is INR 6,00,000, made up of a basic salary of INR 25,000 per month, house rent allowance of INR 15,000 per month and special allowance of INR 10,000 per month.\n",
    );
    expect(labels(a, "CTC")).toEqual(["INR 6,00,000"]);
    expect(labels(a, "BASE_SALARY")).toEqual(["INR 25,000"]);
    expect(labels(a, "HRA")).toEqual(["INR 15,000"]);
    expect(labels(a, "SPECIAL_ALLOWANCE")).toEqual(["INR 10,000"]);
    expect(rules(a)).not.toContain("emp_ctc_single");
  });
});

describe("CTC components that do not add up", () => {
  const letter = (lead: string, basic: string) =>
    `OFFER OF EMPLOYMENT\n\nYour annual cost to the Company (CTC) is INR 1,800,000, ${lead} a basic salary of INR ${basic} per month, house rent allowance of INR 30,000 per month and a special allowance of INR 40,000 per month.\n`;
  it("flags a total the stated components cannot reach", () => {
    expect(rules(run("OFFER_LETTER", letter("made up of", "60,000")))).toContain(
      "emp_ctc_components_monthly",
    );
  });
  it("is quiet when they add up", () => {
    expect(rules(run("OFFER_LETTER", letter("made up of", "80,000")))).not.toContain(
      "emp_ctc_components_monthly",
    );
  });
  it("is quiet when the components are only some of the total", () => {
    expect(rules(run("OFFER_LETTER", letter("including", "60,000")))).not.toContain(
      "emp_ctc_components_monthly",
    );
  });
});

describe("stated term against its dates", () => {
  const lease = (months: string, end: string) =>
    `1. TERM\nThe tenancy is for a period of ${months}, starting on 1 May 2027 and ending on ${end}.\n`;
  it("flags 12 months when the dates span 11", () => {
    expect(rules(run("RESIDENTIAL_RENTAL", lease("12 months", "31 March 2028")))).toContain(
      "rent_term_matches_dates",
    );
  });
  it("accepts month-length rounding (11 months, 36 months for 3 years)", () => {
    expect(rules(run("RESIDENTIAL_RENTAL", lease("11 months", "31 March 2028")))).not.toContain(
      "rent_term_matches_dates",
    );
    expect(rules(run("RESIDENTIAL_RENTAL", lease("36 months", "30 April 2030")))).not.toContain(
      "rent_term_matches_dates",
    );
  });
});

describe("payment deadline stated twice", () => {
  const sa = (second: string) =>
    `3. PAYMENT\nThe Customer shall pay each invoice within 30 days of receiving it.\n\n4. INVOICING\nEach invoice is payable within ${second} of the invoice date.\n`;
  it("flags 30 against 45 days even when only one sentence names a party", () => {
    expect(rules(run("SERVICE_AGREEMENT", sa("45 days")))).toContain("nda_payment_term_single");
  });
  it("is quiet when both say the same", () => {
    expect(rules(run("SERVICE_AGREEMENT", sa("30 days")))).not.toContain("nda_payment_term_single");
  });
  it("still allows different notice periods for different parties", () => {
    const a = run(
      "RESIDENTIAL_RENTAL",
      "7. TERMINATION\nThe Landlord may terminate by giving 15 days written notice. The Tenant may terminate by giving 3 months written notice.\n",
    );
    expect(rules(a)).not.toContain("rent_notice_single");
  });
});

describe("a deposit refund with no deadline", () => {
  const dep = (tail: string) =>
    `4. SECURITY DEPOSIT\nThe Tenant shall pay a deposit of INR 57,000, equal to 2 months' rent. The deposit will be refunded to the Tenant ${tail}.\n`;
  it("is a missing-term finding, not a contradiction", () => {
    const a = run("RESIDENTIAL_RENTAL", dep("after the Tenant vacates"));
    const f = a.findings.find((x) => x.ruleId === "missing_term_deposit_refund_deadline");
    expect(f?.category).toBe("MISSING_CLAUSE");
    expect(f?.severity).toBe("LOW");
    expect(f?.reason).toMatch(/not a contradiction/);
    expect(f?.reason).not.toMatch(/illegal|void|required by law/i);
  });
  it("does not fire when a deadline is given, and a '2 months' amount is not a deadline", () => {
    expect(
      rules(run("RESIDENTIAL_RENTAL", dep("within 30 days after the Tenant vacates"))),
    ).not.toContain("missing_term_deposit_refund_deadline");
  });
});

describe("liability and indemnity", () => {
  const msa = (clause: string) =>
    `5. LIABILITY AND INDEMNITY\n${clause}\n\n8. JURISDICTION\nThe courts at Pune have exclusive jurisdiction.\n`;
  it("flags an indemnity with no limit, whether written as a noun or a verb", () => {
    for (const text of [
      "The indemnity given by the Supplier for third-party claims is not subject to any cap.",
      "The Supplier shall indemnify the Customer without any limit against data breaches.",
    ]) {
      expect(rules(run("MSA", msa(text)))).toContain("uncapped_liability");
    }
  });
  it("does not flag a capped liability with a carve-out", () => {
    const a = run(
      "MSA",
      msa(
        "Each party's total liability is limited to the fees paid in the 12 months before the claim. This limit does not apply to wilful misconduct.",
      ),
    );
    expect(rules(a)).not.toContain("uncapped_liability");
  });
  it("answers a cap question with the limit AND what sits outside it", async () => {
    const a = run(
      "MSA",
      msa(
        "The Supplier's aggregate liability shall not exceed INR 25,00,000. Nothing in this clause limits liability for fraud. The indemnity for data breaches is not subject to any cap.",
      ),
    );
    const res = await ask(a, "What is the limit of liability?");
    expect(res.evidenceStatus).toBe("GROUNDED");
    expect(res.answer).toContain("25,00,000");
    expect(res.answer).toContain("fraud");
    expect(res.answer).toContain("not subject to any cap");
  });
  it("says so when the document has no liability limit at all", async () => {
    const a = run("NDA", "1. PURPOSE\nThe parties will discuss a project.\n");
    expect((await ask(a, "Is there a cap on liability?")).evidenceStatus).toBe("NOT_SUFFICIENT");
  });
});

describe("retention against return", () => {
  const nda = (keep: string) =>
    `6. RETURN\nWithin 10 days of a written request, the Recipient shall return or destroy all material. The Recipient may nevertheless keep archival copies for ${keep}.\n`;
  it("flags copies kept far longer than the return deadline, as a review item", () => {
    const a = run("NDA", nda("6 years"));
    const f = a.findings.find((x) => x.ruleId === "nda_return_vs_retention");
    expect(f?.reason).toMatch(/review required/);
  });
  it("is quiet when nothing may be kept longer", () => {
    expect(rules(run("NDA", nda("5 days")))).not.toContain("nda_return_vs_retention");
  });
});

describe("party roles", () => {
  it("keeps Party A and Party B distinct, and reads Supplier as the service provider", async () => {
    const a = run(
      "MUTUAL_NDA",
      'This Agreement is made on 9 August 2027 between Tessera Biosystems Pvt. Ltd., Hyderabad ("Party A") and Calder Instruments Pvt. Ltd., Bengaluru ("Party B").\n',
    );
    expect(labels(a, "PARTY_A")).toEqual(["Tessera Biosystems Pvt. Ltd."]);
    expect(labels(a, "PARTY_B")).toEqual(["Calder Instruments Pvt. Ltd."]);
    const res = await ask(a, "Who is Party B?");
    expect(res.answer).toContain("Calder Instruments");
    expect(res.answer).not.toContain("Tessera");
    const m = run(
      "MSA",
      'Made on 23 August 2027 between Coastal Freight Lines Pvt. Ltd., Vizag (the "Customer") and Nimbus Cloud Services Pvt. Ltd., Hyderabad (the "Supplier").\n',
    );
    expect(labels(m, "CLIENT")).toEqual(["Coastal Freight Lines Pvt. Ltd."]);
    expect(labels(m, "SERVICE_PROVIDER")).toEqual(["Nimbus Cloud Services Pvt. Ltd."]);
  });
  it("keeps 'Pvt. Ltd.' whole in a signature line, so one company is not two parties", () => {
    const a = run(
      "NDA",
      'Made on 8 July 2027 between Orbit Robotics Pvt. Ltd., Noida (the "Disclosing Party") and Mr. Karan Malhotra, Delhi (the "Recipient").\n\nSIGNATURES\nDisclosing Party: Orbit Robotics Pvt. Ltd. ____________  Date: ______\n',
    );
    expect(new Set(labels(a, "DISCLOSING_PARTY")).size).toBe(1);
    expect(rules(a)).not.toContain("nda_discloser_single");
  });
});

describe("employment rules with 'the Employer'", () => {
  const contract = (employer: string) =>
    `5) NOTICE\nThe Employee must give the ${employer} 90 days written notice of resignation. The ${employer} may end the employment by giving the Employee 15 days written notice.\n\n6) NON-COMPETE\nFor 24 months after employment ends, the Employee shall not work for a competitor.\n`;
  it("flags uneven notice and a post-employment restriction", () => {
    const a = run("EMPLOYMENT_CONTRACT", contract("Employer"));
    const categories = a.findings.map((f) => f.category);
    expect(categories).toContain("ASYMMETRIC_OBLIGATION");
    expect(categories).toContain("RESTRICTIVE_COVENANT");
  });
});

describe("a missing clause is not claimed when its heading is merely unfamiliar", () => {
  it("accepts 'Courts' with a jurisdiction sentence, and a heading naming two topics", () => {
    const a = run(
      "EMPLOYMENT_CONTRACT",
      "1) DESIGNATION AND JOINING\nThe Company employs the Employee as Analyst. The Employee shall join on 1 July 2027.\n\n9) Courts\nThe courts at Pune have exclusive jurisdiction.\n",
    );
    const missing = a.findings.filter((f) => f.category === "MISSING_CLAUSE").map((f) => f.reason);
    expect(missing.join(" ")).not.toMatch(/jurisdiction|commencement|position/i);
  });
  it("still reports a clause that really is absent, and skips a document with no clause structure", () => {
    const a = run(
      "RESIDENTIAL_RENTAL",
      "1. TERM\nThe tenancy is for 11 months.\n\n2. RENT\nThe Tenant shall pay rent of INR 20,000.\n",
    );
    expect(a.findings.some((f) => /security deposit/i.test(f.reason))).toBe(true);
    const letter = run("OFFER_LETTER", "Dear Ms. Rao, we offer you a role. Please sign.\n");
    expect(letter.findings.filter((f) => f.category === "MISSING_CLAUSE")).toEqual([]);
  });
});

describe("conflict-aware answers and unanswerable questions", () => {
  const rental =
    "3. RENT\nThe Tenant shall pay monthly rent of INR 28,500 on the 7th of each month.\n\nSCHEDULE OF PAYMENTS\nMonthly Rent: INR 31,000\n";
  it("reports both values with separate citations rather than choosing one", async () => {
    const res = await ask(run("RESIDENTIAL_RENTAL", rental), "What is the monthly rent?");
    expect(res.answer).toContain("28,500");
    expect(res.answer).toContain("31,000");
    expect(res.answer).toMatch(/does not say which governs/);
    expect(res.sources.map((s) => s.excerpt)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("28,500"),
        expect.stringContaining("31,000"),
      ]),
    );
  });
  it("answers plainly when a value is merely repeated", async () => {
    const res = await ask(
      run("RESIDENTIAL_RENTAL", rental.replace("31,000", "28,500")),
      "What is the monthly rent?",
    );
    expect(res.answer).not.toMatch(/more than one/);
  });
  it("refuses a question about something the document never mentions", async () => {
    const a = run("RESIDENTIAL_RENTAL", rental);
    for (const q of ["What interest is charged on late rent?", "What is the parking charge?"]) {
      const res = await ask(a, q);
      expect(res.evidenceStatus, q).toBe("NOT_SUFFICIENT");
      expect(res.sources).toEqual([]);
    }
  });
});
