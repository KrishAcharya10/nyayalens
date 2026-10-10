import { describe, expect, it } from "vitest";
import { runRuleBasedClauseClassification } from "../src/clauses/ruleBasedClauseClassifier.js";
import { segmentClauses } from "../src/clauses/clauseSegmenter.js";
import { taxonomyFromSchema } from "../src/clauses/clauseTaxonomy.js";
import { runConsistency } from "../src/consistency/engine.js";
import { detectDomain } from "../src/domains/detectDomain.js";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";
import { answerStructured } from "../src/rag/structuredQa.js";
import { containsDefinitiveJudgment } from "../src/risk/reasonFraming.js";
import { analyzeText } from "../src/semantic/analyze.js";
import { extractObligations } from "../src/semantic/extract.js";
import {
  parseArea,
  parseDate,
  parseDuration,
  parseMoney,
  parsePercent,
} from "../src/semantic/normalize.js";

const registry = getDomainPackRegistry();
const sale = registry.forDocumentType("AGREEMENT_TO_SELL");

// Hand-written (not generator output) so these test behaviour, not templates.
function saleText(opts: { balance?: string; schedulePrice?: string; balancePayer?: string } = {}) {
  const balance = opts.balance ?? "Rs. 65,00,000";
  const payer = opts.balancePayer ?? "Purchaser";
  const payee = payer === "Purchaser" ? "Vendor" : "Purchaser";
  return (
    "AGREEMENT TO SELL\n\n" +
    "This Agreement is executed at Pune on 14th March 2026 between:\n\n" +
    'Mr. Arun Mehta, aged about 52 years, S/o Shri Vikas Mehta, residing at House No. 4, Baner, Pune - 411045, hereinafter referred to as the "VENDOR" (which expression shall include his heirs) of the ONE PART;\n\nAND\n\n' +
    'Ms. Kavya Rao, aged about 34 years, D/o Shri Ramesh Rao, residing at Flat No. 12, Kothrud, Pune - 411038, hereinafter referred to as the "PURCHASER" (which expression shall include her heirs) of the OTHER PART.\n\n' +
    "WHEREAS the Vendor is the absolute owner of the residential flat described in the Schedule below, having acquired the same by a registered Sale Deed bearing Document No. 2210 of 2015;\n\n" +
    "1. CONSIDERATION\nThe total sale consideration for the said Property is agreed at Rs. 75,00,000.\n\n" +
    "2. ADVANCE\nThe Purchaser shall pay a sum of Rs. 10,00,000 to the Vendor as advance on the execution of this Agreement.\n\n" +
    `3. BALANCE PAYMENT\nThe ${payer} shall pay the balance consideration of ${balance} to the ${payee} on or before 30th June 2026.\n\n` +
    "4. POSSESSION\nThe Vendor shall hand over vacant possession of the said Property to the Purchaser on or before 15th July 2026.\n\n" +
    "5. JURISDICTION\nThe courts at Pune shall have exclusive jurisdiction over any matter arising from this Agreement.\n\n" +
    `SCHEDULE OF THE PROPERTY\nConsideration for the above property: ${opts.schedulePrice ?? "Rs. 75,00,000"}\n`
  );
}

function analyze(text: string, documentType = "AGREEMENT_TO_SELL") {
  const pack = registry.forDocumentType(documentType);
  const entities = runRuleBasedNer(text, {
    allowedLabels: new Set(pack.entitySchema.map((e) => e.label)),
    pack,
  }).map((e, i) => ({ ...e, id: `e${i}` }));
  const clauses = runRuleBasedClauseClassification(text, taxonomyFromSchema(pack.clauseSchema)).map(
    (c, i) => ({ ...c, id: `c${i}` }),
  );
  return {
    pack,
    entities,
    clauses,
    ...analyzeText({ documentId: "d1", documentType, pack, text, entities, clauses }),
  };
}

describe("normalization", () => {
  it("parses Indian and international money formats", () => {
    expect(parseMoney("₹8,90,000")?.amount).toBe(890000);
    expect(parseMoney("Rs. 10,00,000")?.amount).toBe(1000000);
    expect(parseMoney("INR 1000000")?.amount).toBe(1000000);
    expect(parseMoney("₹890,000")?.amount).toBe(890000);
    expect(parseMoney("Rs. 10 Lakhs")?.amount).toBe(1000000);
    expect(parseMoney("₹1.5 crore")?.amount).toBe(15000000);
    expect(parseMoney("no amount")).toBeNull();
  });

  it("parses every date style to ISO and rejects impossible dates", () => {
    for (const s of [
      "14th day of March, 2025",
      "14th March 2025",
      "March 14, 2025",
      "14/03/2025",
      "14.03.2025",
    ]) {
      expect(parseDate(s)?.iso, s).toBe("2025-03-14");
    }
    expect(parseDate("31/02/2025")).toBeNull();
  });

  it("parses durations, percentages and areas", () => {
    expect(parseDuration("eleven (11) months")).toEqual({ value: 11, unit: "month", days: 330 });
    expect(parseDuration("11 (eleven) months")?.value).toBe(11);
    expect(parseDuration("90 days")?.days).toBe(90);
    expect(parseDuration("five years")?.unit).toBe("year");
    expect(parsePercent("five per cent (5%)")?.value).toBe(5);
    expect(parsePercent("10 percent")?.value).toBe(10);
    expect(parseArea("1,450 sq. mtrs.")).toEqual({ value: 1450, unit: "sq. mtrs." });
  });
});

describe("clause segmentation styles", () => {
  it("recognises numbered, Clause N:, roman, paren, inline and unnumbered headings", () => {
    const text =
      "1. RENT\nbody\n\nClause 2: Security Deposit\nbody\n\nARTICLE III - TERMINATION\nbody\n\n" +
      "4) JURISDICTION\nbody\n\n5. Dispute Resolution: body\n\nSCHEDULE OF THE PROPERTY\nbody\n";
    expect(segmentClauses(text).map((s) => [s.clauseNumber, s.heading])).toEqual([
      ["1", "RENT"],
      ["2", "Security Deposit"],
      ["3", "TERMINATION"],
      ["4", "JURISDICTION"],
      ["5", "Dispute Resolution"],
      [null, "SCHEDULE OF THE PROPERTY"],
    ]);
  });
});

describe("pack-driven extraction (sale)", () => {
  it("finds parties under alternative terms and classifies amounts by context", () => {
    const { entities } = analyze(saleText());
    const byLabel = (l: string) => entities.filter((e) => e.label === l).map((e) => e.text);
    expect(byLabel("SELLER")).toContain("Arun Mehta");
    expect(byLabel("BUYER")).toContain("Kavya Rao");
    expect(byLabel("ADVANCE_AMOUNT")).toEqual(["Rs. 10,00,000"]);
    expect(byLabel("BALANCE_AMOUNT")).toEqual(["Rs. 65,00,000"]);
    expect(byLabel("SALE_CONSIDERATION")).toEqual(["Rs. 75,00,000", "Rs. 75,00,000"]);
    expect(byLabel("POSSESSION_DATE")).toEqual(["15th July 2026"]);
    // An age is not a duration-like term, and the place of execution is found.
    expect(entities.some((e) => e.text === "52 years")).toBe(false);
    expect(byLabel("ADDRESS")).toEqual(["Pune"]);
  });
});

describe("obligation extraction", () => {
  it("extracts actor, action, amount and deadline, including passive voice", () => {
    const { obligations } = analyze(saleText());
    const pay = obligations.filter((o) => o.action === "PAY");
    expect(pay.map((o) => [o.actorLabel, o.amountLabel])).toEqual([
      ["BUYER", "ADVANCE_AMOUNT"],
      ["BUYER", "BALANCE_AMOUNT"],
    ]);
    expect(pay[1]!.deadlineIso).toBe("2026-06-30");
    const deliver = obligations.find((o) => o.action === "DELIVER_POSSESSION");
    expect(deliver?.actorLabel).toBe("SELLER");
    expect(deliver?.deadlineIso).toBe("2026-07-15");

    const passive = extractObligations(
      sale,
      "The balance amount of Rs. 5,000 shall be paid by the Purchaser to the Vendor.",
      [{ id: "m", label: "BALANCE_AMOUNT", text: "Rs. 5,000", textStart: 25, textEnd: 34 }],
      [],
    );
    expect(passive[0]?.actorLabel).toBe("BUYER");
  });

  it("flags an unexpected actor instead of silently correcting it", () => {
    const { obligations } = analyze(saleText({ balancePayer: "Vendor" }));
    const balance = obligations.find((o) => o.amountLabel === "BALANCE_AMOUNT");
    expect(balance?.actorLabel).toBe("SELLER");
    expect(balance?.unexpectedActor).toBe(true);
  });
});

describe("consistency engine", () => {
  const consistency = (text: string) =>
    analyze(text).findings.filter((f) => f.pass === "CONSISTENCY");

  it("reports nothing on a consistent document", () => {
    expect(consistency(saleText())).toEqual([]);
  });

  it("flags a contradicting sale consideration with both spans as evidence", () => {
    const f = consistency(saleText({ schedulePrice: "Rs. 80,00,000" }));
    const contradiction = f.find((x) => x.category === "FINANCIAL_CONTRADICTION");
    expect(contradiction?.ruleId).toBe("sale_consideration_single");
    expect(contradiction?.evidence.map((e) => e.text)).toEqual(["Rs. 75,00,000", "Rs. 80,00,000"]);
    expect(contradiction?.reviewRequired).toBe(true);
  });

  it("flags advance + balance != consideration", () => {
    const f = consistency(saleText({ balance: "Rs. 60,00,000" }));
    expect(f.map((x) => x.category)).toContain("PAYMENT_TOTAL_MISMATCH");
  });

  it("flags a balance payable by the seller", () => {
    const f = consistency(saleText({ balancePayer: "Vendor" }));
    expect(f.map((x) => x.ruleId)).toContain("sale_balance_payer");
  });

  it("does not treat per-party notice periods as a contradiction", () => {
    const rental = registry.forDocumentType("RESIDENTIAL_RENTAL");
    const text =
      "4. NOTICE PERIOD\nThe Tenant may vacate only after giving the Landlord 90 days written notice, whereas the Landlord may require the Tenant to vacate by giving 15 days notice.\n";
    const entities = runRuleBasedNer(text, {
      pack: rental,
      allowedLabels: new Set(["NOTICE_PERIOD"]),
    }).map((e, i) => ({ ...e, id: `e${i}` }));
    expect(entities).toHaveLength(2);
    expect(
      runConsistency({ documentId: "d", pack: rental, text, entities, obligations: [] }),
    ).toEqual([]);
  });

  it("phrases every finding as a potential issue, never a verdict", () => {
    for (const f of consistency(
      saleText({ schedulePrice: "Rs. 80,00,000", balance: "Rs. 60,00,000" }),
    )) {
      expect(containsDefinitiveJudgment(f.reason), f.reason).toBe(false);
    }
  });
});

describe("generic risk checks", () => {
  const risks = (text: string, documentType: string) =>
    analyze(text, documentType)
      .findings.filter((f) => f.pass !== "CONSISTENCY")
      .map((f) => f.category);

  it("liability shift: flags structural repairs on the licensee, not a fair split in one sentence", () => {
    const unfair =
      "1. MAINTENANCE\nThe Licensee shall carry out all repairs, including structural repairs and seepage, at the Licensee's own cost.\n";
    const fair =
      "1. MAINTENANCE\nThe Licensee shall carry out minor repairs, while structural repairs shall be borne by the Licensor.\n";
    expect(risks(unfair, "LEAVE_AND_LICENSE")).toContain("LIABILITY_SHIFT");
    expect(risks(fair, "LEAVE_AND_LICENSE")).not.toContain("LIABILITY_SHIFT");
  });

  it("restrictive covenant, uncapped liability and one-sided remedy", () => {
    expect(
      risks(
        "1. NON-COMPETE\nFor 24 months after leaving the Company, the Employee shall not join any competitor.\n",
        "EMPLOYMENT_CONTRACT",
      ),
    ).toContain("RESTRICTIVE_COVENANT");
    expect(
      risks(
        "1. LIABILITY\nThe liability of the Service Provider under this Agreement shall be unlimited.\n",
        "MSA",
      ),
    ).toContain("UNCAPPED_LIABILITY");
    expect(
      risks(
        "1. CANCELLATION\nIf the Allottee cancels, 25% of the total price shall stand forfeited.\n",
        "BUILDER_BUYER_AGREEMENT",
      ),
    ).toContain("ONE_SIDED_REMEDY");
  });
});

describe("domain detection", () => {
  it("names the domain from title and content, with signals and no probabilities", () => {
    const d = detectDomain(saleText(), registry.list());
    expect(d.predictedDomain).toBe("sale_property");
    expect(d.predictedDocumentType).toBe("AGREEMENT_TO_SELL");
    expect(d.supportingSignals.some((s) => s.startsWith("title:"))).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/probabilit|confidence/i);
  });

  it("uses content when the title is generic", () => {
    const text = saleText().replace("AGREEMENT TO SELL", "AGREEMENT");
    expect(detectDomain(text, registry.list()).predictedDomain).toBe("sale_property");
    const ll =
      'AGREEMENT\n\nMr. A B, hereinafter referred to as the "LICENSOR" of the ONE PART;\n\nAND\n\nMs. C D, hereinafter referred to as the "LICENSEE" of the OTHER PART.\n\nThe Licensee shall pay a monthly license fee. Nothing herein shall create any tenancy.\n';
    expect(detectDomain(ll, registry.list()).predictedDomain).toBe("leave_and_license");
  });
});

describe("structured question answering", () => {
  const ask = (question: string, text = saleText()) => {
    const a = analyze(text);
    return answerStructured({
      question,
      pack: a.pack,
      entities: a.entities,
      findings: a.findings,
      allPacks: registry.list(),
    });
  };

  it("answers a factual question with its evidence span", () => {
    const a = ask("What is the sale consideration?");
    expect(a?.status).toBe("GROUNDED");
    expect(a?.answer).toBe("Rs. 75,00,000");
    expect(a?.evidence[0]?.text).toBe("Rs. 75,00,000");
  });

  it("computes a difference across two clauses", () => {
    const a = ask("How much of the sale consideration remains payable after the advance?");
    expect(a?.normalized).toEqual({ amount: 6500000, currency: "INR" });
    expect(a?.evidence).toHaveLength(2);
  });

  it("computes the remainder when the question names only the part", () => {
    // Found running the app: this used to answer with the advance itself.
    const a = ask("How much remains after the advance?");
    expect(a?.kind).toBe("difference");
    expect(a?.normalized).toEqual({ amount: 6500000, currency: "INR" });
  });

  it("refuses for a field the document lacks and for another domain's field", () => {
    expect(ask("What is the stamp duty?")?.status).toBe("NOT_SUFFICIENT");
    const probation = ask("What is the probation period?");
    expect(probation?.status).toBe("NOT_SUFFICIENT");
    // The best foreign match, not the first pack over the bar (rental's notice period).
    expect(probation?.answer).toMatch(/probation period/);
  });

  it("cites the first mention of a party, not a later restatement", () => {
    const a = ask("Who is the buyer?");
    const firstBuyer = a?.evidence[0];
    expect(firstBuyer).toBeDefined();
    const all = analyze(saleText()).entities.filter(
      (e) => e.label === "BUYER" && e.text === firstBuyer!.text,
    );
    expect(firstBuyer!.textStart).toBe(Math.min(...all.map((e) => e.textStart)));
  });

  it("answers consistency questions from the consistency findings", () => {
    expect(ask("Is the sale consideration stated consistently?")?.answer).toMatch(/^Yes/);
    const no = ask(
      "Is the sale consideration stated consistently?",
      saleText({ schedulePrice: "Rs. 80,00,000" }),
    );
    expect(no?.answer).toMatch(/^No/);
    expect(no?.evidence).toHaveLength(2);
  });
});
