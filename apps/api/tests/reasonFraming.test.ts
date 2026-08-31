import { describe, expect, it } from "vitest";
import { runPass1 } from "../src/risk/pass1PerClause.js";
import { runPass2 } from "../src/risk/pass2CrossClause.js";
import { containsDefinitiveJudgment } from "../src/risk/reasonFraming.js";
import type { RiskEngineContext } from "../src/risk/types.js";

// Verifies REAL generated reason strings, not just the templates read by
// eye - a template can look fine and still be wrong if a future edit
// concatenates something unreviewed into it. See reasonFraming.ts.
describe("risk reason text never uses definitive legal-judgment language", () => {
  it("containsDefinitiveJudgment itself catches known forbidden phrases", () => {
    expect(containsDefinitiveJudgment("This clause is illegal.")).toBe(true);
    expect(containsDefinitiveJudgment("This clause is invalid under the Act.")).toBe(true);
    expect(containsDefinitiveJudgment("This may be a potentially unfavorable term.")).toBe(false);
  });

  it("every Pass 1 finding across all three per-clause categories uses non-definitive framing", () => {
    const context: RiskEngineContext = {
      documentId: "doc-1",
      documentType: "RESIDENTIAL_RENTAL",
      clauses: [
        {
          id: "c1",
          clauseType: "MAINTENANCE",
          clauseNumber: "4",
          text: "4. MAINTENANCE\nstructural repairs shall be borne by the Tenant.",
          textStart: 0,
          textEnd: 60,
        },
        {
          id: "c2",
          clauseType: "SECURITY_DEPOSIT",
          clauseNumber: "3",
          text: "3. SECURITY DEPOSIT\ndeductions as deemed fit by the Landlord.",
          textStart: 60,
          textEnd: 120,
        },
      ],
      entities: [],
    };
    const findings = runPass1(context);
    expect(findings.length).toBeGreaterThan(0); // sanity: this test must actually exercise findings
    for (const finding of findings) {
      expect(containsDefinitiveJudgment(finding.reason), finding.reason).toBe(false);
    }
  });

  it("every Pass 2 finding across both cross-clause categories uses non-definitive framing", () => {
    const context: RiskEngineContext = {
      documentId: "doc-1",
      documentType: "LAND_LEASE",
      clauses: [
        {
          id: "c1",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "5",
          text: "5. NOTICE PERIOD (LESSOR)\nnotice period of 15 days.",
          textStart: 0,
          textEnd: 60,
        },
        {
          id: "c2",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "6",
          text: "6. NOTICE PERIOD (LESSEE)\nnotice period of 60 days.",
          textStart: 60,
          textEnd: 120,
        },
        {
          id: "c3",
          clauseType: "LAND_USE_RESTRICTION",
          clauseNumber: "4",
          text: "4. PERMITTED USE\nconstruction of a warehouse facility.",
          textStart: 120,
          textEnd: 180,
        },
      ],
      entities: [
        { id: "e1", label: "NOTICE_PERIOD", text: "15 days", textStart: 20, textEnd: 27 },
        { id: "e2", label: "NOTICE_PERIOD", text: "60 days", textStart: 80, textEnd: 87 },
        { id: "e3", label: "LAND_USE_TYPE", text: "Agricultural", textStart: 130, textEnd: 142 },
      ],
    };
    const findings = runPass2(context);
    expect(findings.length).toBeGreaterThanOrEqual(2); // both categories should have fired
    for (const finding of findings) {
      expect(containsDefinitiveJudgment(finding.reason), finding.reason).toBe(false);
    }
  });
});
