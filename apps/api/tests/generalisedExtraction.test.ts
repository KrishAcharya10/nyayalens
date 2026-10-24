import { describe, expect, it } from "vitest";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";
import {
  makeAsymmetricNoticeCheck,
  makeDiscretionCheck,
  makeLiabilityShiftCheck,
  makeOneSidedRemedyCheck,
} from "../src/risk/factChecks.js";
import { detectMissingClauses } from "../src/risk/missingClauseCheck.js";
import type { ClauseInput, RiskEngineContext } from "../src/risk/types.js";
import { sentences } from "../src/semantic/extract.js";

// Regression tests for defects found by running the pipeline on agreements
// written the way people write them (curly-quoted definitions, "1 November
// 2026", "Landlord: Name ____" signature lines), after the rules had only
// been exercised on the generator's wording. Each test is one rule change.
const registry = getDomainPackRegistry();

function ner(documentType: string, text: string) {
  const pack = registry.forDocumentType(documentType);
  return runRuleBasedNer(text, {
    allowedLabels: new Set(pack.entitySchema.map((e) => e.label)),
    pack,
  });
}
const find = (found: ReturnType<typeof ner>, label: string) =>
  found.filter((e) => e.label === label).map((e) => e.text);

function ctx(clauseType: string, text: string, clauseNumber = "1"): RiskEngineContext {
  const clause: ClauseInput = {
    id: "c1",
    clauseType,
    clauseNumber,
    text,
    textStart: 0,
    textEnd: text.length,
  };
  return { documentId: "d", documentType: "RESIDENTIAL_RENTAL", clauses: [clause], entities: [] };
}

describe("party names defined in brackets after the name", () => {
  const text =
    "This Agreement is made on 1 November 2026 between Ms. Ananya Mehta, residing at 14 Lake View Road, Pune, Maharashtra (the “Landlord”), and Mr. Rohan Shah, residing at 22 Green Park, Pune (the “Tenant”).";

  it("finds the name before each bracketed role, not the address or the other party", () => {
    const found = ner("RESIDENTIAL_RENTAL", text);
    expect(find(found, "LANDLORD")).toEqual(["Ananya Mehta"]);
    expect(find(found, "TENANT")).toEqual(["Rohan Shah"]);
  });

  it("stops a name at 'of' and handles a plain-quote definition", () => {
    const found = ner(
      "LEAVE_AND_LICENSE",
      'between Mr. Dev Kulkarni of 8 Palm Grove, Mumbai (the "Licensor") and Ms. Isha Nair of 17 Hill Road (the "Licensee").',
    );
    expect(find(found, "LICENSOR")).toEqual(["Dev Kulkarni"]);
    expect(find(found, "LICENSEE")).toEqual(["Isha Nair"]);
  });

  it("finds a company when there is no honorific", () => {
    const found = ner(
      "EMPLOYMENT_CONTRACT",
      'This Agreement is made between Acme Technologies Pvt. Ltd. (the "Company") and Mr. Vikram Shah (the "Employee").',
    );
    expect(find(found, "EMPLOYER")).toEqual(["Acme Technologies Pvt. Ltd."]);
    expect(find(found, "EMPLOYEE")).toEqual(["Vikram Shah"]);
  });

  it("reads a signature line 'Landlord: Name ____'", () => {
    const found = ner(
      "RESIDENTIAL_RENTAL",
      "Landlord: Ananya Mehta ____________    Date: ______Tenant: Rohan Shah ____________    Date: ______",
    );
    expect(find(found, "LANDLORD")).toContain("Ananya Mehta");
    expect(find(found, "TENANT")).toContain("Rohan Shah");
  });

  it("accepts the other words the same role is called (Owner / Cultivator)", () => {
    const found = ner(
      "LAND_LEASE",
      "between Mr. Suresh Patil of Village Karanj (the “Owner”) and Ms. Meera Jadhav of Village Nimbut (the “Cultivator”).",
    );
    expect(find(found, "LESSOR")).toEqual(["Suresh Patil"]);
    expect(find(found, "LESSEE")).toEqual(["Meera Jadhav"]);
  });
});

describe("dates, durations and areas in everyday wording", () => {
  it("labels 'D Month YYYY' dates by their context", () => {
    const found = ner(
      "RESIDENTIAL_RENTAL",
      "This Rental Agreement is made on 1 November 2026 between the parties. The tenancy shall commence on 1 November 2026 and continue for 12 months, ending on 31 October 2027.",
    );
    expect(find(found, "EXECUTION_DATE")).toEqual(["1 November 2026"]);
    expect(find(found, "COMMENCEMENT_DATE")).toEqual(["1 November 2026"]);
    expect(find(found, "EXPIRY_DATE")).toEqual(["31 October 2027"]);
  });

  it("reads 'begins on' / 'ends on' for a licence period", () => {
    const found = ner(
      "LEAVE_AND_LICENSE",
      "The license period begins on 1 December 2026 and ends on 30 November 2027.",
    );
    expect(find(found, "COMMENCEMENT_DATE")).toEqual(["1 December 2026"]);
    expect(find(found, "EXPIRY_DATE")).toEqual(["30 November 2027"]);
  });

  it("reads a notice period written with a typographic apostrophe, keeping the text the document's own", () => {
    const text = "Either party may terminate by giving 60 days’ written notice.";
    const found = ner("RESIDENTIAL_RENTAL", text);
    const notice = found.find((e) => e.label === "NOTICE_PERIOD");
    expect(notice?.text).toBe("60 days");
    expect(text.slice(notice!.textStart, notice!.textEnd)).toBe(notice!.text);
  });

  it("reads an area in square feet", () => {
    const found = ner(
      "AGREEMENT_TO_SELL",
      "being Flat No. 702 admeasuring 910 square feet carpet area",
    );
    expect(found.map((e) => e.text)).not.toContain("910 square feet admeasuring");
  });

  it("keeps an alphanumeric CTS number whole", () => {
    const found = ner(
      "AGREEMENT_TO_SELL",
      "described as CTS No. 884A, carpet area 910 square feet",
    );
    expect(find(found, "CTS_NUMBER")).toEqual(["884A"]);
  });

  it("treats 'INR x per year' as rent for a land lease", () => {
    const found = ner(
      "LAND_LEASE",
      "The Cultivator shall pay the Owner INR 1,20,000 per agricultural year, in two instalments.",
    );
    expect(find(found, "RENT")).toEqual(["INR 1,20,000"]);
  });

  it("labels an advance described as a 'booking advance'", () => {
    const found = ner(
      "AGREEMENT_TO_SELL",
      "The Buyer shall pay INR 1,000,000 as booking advance upon signing.",
    );
    expect(find(found, "ADVANCE_AMOUNT")).toEqual(["INR 1,000,000"]);
  });

  it("always returns entity text equal to the document's own characters at that span", () => {
    const text =
      "between Ms. Ananya Mehta, residing at 14 Lake View Road (the “Landlord”), and Mr. Rohan Shah (the “Tenant”). Notice: 60 days’ written notice. Rent INR 32,000.";
    for (const e of ner("RESIDENTIAL_RENTAL", text)) {
      expect(text.slice(e.textStart, e.textEnd), e.label).toBe(e.text);
    }
  });
});

describe("free-text values stop at the end of their sentence", () => {
  it("does not run a working-hours value into the next clause", () => {
    // The value pattern ends at a blank line; the sentence clip must end it earlier.
    const text =
      "Your working hours shall be 9:30 a.m. to 6:30 p.m., Monday to Friday. 6. LEAVE AND HOLIDAYS You shall be entitled to 18 days of paid leave.\n\nNext paragraph.";
    const found = ner("EMPLOYMENT_CONTRACT", text);
    expect(find(found, "WORKING_HOURS")).toEqual(["9:30 a.m. to 6:30 p.m., Monday to Friday"]);
  });
});

describe("liability shift (maintenance clause)", () => {
  const check = makeLiabilityShiftCheck("MAINTENANCE", ["Tenant"]);
  const flags = (text: string) => check.run(ctx("MAINTENANCE", text)).length;

  it("does not flag a clause that puts repairs on the owner and excepts damage the tenant causes", () => {
    expect(
      flags(
        "The Tenant shall keep the Premises reasonably clean. The Landlord shall arrange structural repairs, except to the extent damage is caused by the Tenant’s negligence or misuse.",
      ),
    ).toBe(0);
  });

  it("does not flag 'caused by the Tenant' even without a possessive", () => {
    expect(
      flags(
        "The Landlord shall bear structural repair costs, other than damage caused by the Tenant.",
      ),
    ).toBe(0);
  });

  it("does not flag a prohibition on structural changes", () => {
    expect(flags("The Tenant shall not make any structural changes to the Premises.")).toBe(0);
  });

  it("still flags structural repairs put on the tenant", () => {
    expect(flags("Structural repairs shall be borne by the Tenant.")).toBe(1);
    expect(flags("The Tenant shall bear the cost of all repairs, structural or otherwise.")).toBe(
      1,
    );
    expect(
      flags("The Tenant accepts responsibility for all repairs irrespective of the cause."),
    ).toBe(1);
  });
});

describe("unbounded discretion and one-sided remedies in termination clauses", () => {
  const discretion = makeDiscretionCheck(["TERMINATION"]);
  const oneSided = makeOneSidedRemedyCheck(["SECURITY_DEPOSIT", "TERMINATION"]);

  it("flags 'whenever the Landlord considers the conduct undesirable'", () => {
    const findings = discretion.run(
      ctx(
        "TERMINATION",
        "The Landlord may require the Tenant to vacate whenever the Landlord considers the Tenant’s conduct undesirable.",
      ),
    );
    expect(findings.map((f) => f.category)).toEqual(["UNBOUNDED_DISCRETION"]);
  });

  it("flags 'if the Owner believes ... improperly'", () => {
    expect(
      discretion.run(
        ctx(
          "TERMINATION",
          "The Owner may terminate immediately if the Owner believes the Cultivator has used the Land improperly.",
        ),
      ),
    ).toHaveLength(1);
  });

  it("does not flag an objective termination trigger", () => {
    expect(
      discretion.run(
        ctx(
          "TERMINATION",
          "Either party may terminate if the other fails to pay rent for three consecutive months.",
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags retaining the entire deposit, and not a refund of the balance", () => {
    expect(
      oneSided.run(
        ctx(
          "TERMINATION",
          "The Licensor may retain the entire security deposit if the Licensee gives any notice of termination.",
        ),
      ),
    ).toHaveLength(1);
    expect(
      oneSided.run(
        ctx(
          "SECURITY_DEPOSIT",
          "The Licensor shall return the balance of the deposit within 15 days, subject to documented deductions.",
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("asymmetric notice in a termination clause", () => {
  const check = makeAsymmetricNoticeCheck(["NOTICE_PERIOD", "TERMINATION"], {
    LANDLORD: ["Landlord"],
    TENANT: ["Tenant"],
  });
  const run = (text: string) => check.run(ctx("TERMINATION", text));

  it("flags a right to end the tenancy without notice that only one side has", () => {
    expect(
      run(
        "Either party may terminate this Agreement by giving 60 days’ written notice. However, the Landlord may also require the Tenant to vacate immediately, without notice and without an opportunity to remedy the issue.",
      ),
    ).toHaveLength(1);
  });

  it("does not flag the same notice period for both sides", () => {
    expect(
      run("Either party may terminate this Agreement by giving 60 days’ written notice."),
    ).toHaveLength(0);
    expect(
      run(
        "The Landlord shall give the Tenant 30 days' notice. The Tenant shall give the Landlord 30 days' notice.",
      ),
    ).toHaveLength(0);
  });
});

describe("obligation sentences", () => {
  const text = [
    "2. TITLE OF THE SELLER",
    "The Seller shall produce the originals of all title deeds within fifteen days from today.",
    "",
    "3. SUBJECT PREMISES",
    "The Buyer shall pay the balance on completion.",
  ].join("\n");

  it("never begin with a heading or end with the next clause's number", () => {
    const found = sentences(text).map((s) => s.text);
    expect(found).toContain(
      "The Seller shall produce the originals of all title deeds within fifteen days from today.",
    );
    // Every sentence that states a duty is that sentence alone: no heading in
    // front of it, no "3." from the next clause behind it.
    for (const s of found.filter((x) => /shall/.test(x))) {
      expect(s).not.toMatch(/TITLE OF THE SELLER|SUBJECT PREMISES|\b\d\.$/);
    }
  });

  it("keep offsets that index the original text", () => {
    for (const s of sentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe("missing clauses", () => {
  it("does not call the advance missing when a payment schedule covers it", () => {
    const context = ctx("PAYMENT_SCHEDULE", "The Buyer shall pay an advance, then the balance.");
    const severity = { ADVANCE: "MEDIUM", BALANCE_PAYMENT: "HIGH" } as const;
    expect(detectMissingClauses(context, ["ADVANCE", "BALANCE_PAYMENT"], severity)).toHaveLength(2);
    expect(
      detectMissingClauses(context, ["ADVANCE", "BALANCE_PAYMENT"], severity, {
        ADVANCE: ["PAYMENT_SCHEDULE"],
        BALANCE_PAYMENT: ["PAYMENT_SCHEDULE"],
      }),
    ).toHaveLength(0);
  });
});
