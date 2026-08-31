import { describe, expect, it } from "vitest";
import { runPass1 } from "../src/risk/pass1PerClause.js";
import type { RiskEngineContext } from "../src/risk/types.js";

function makeContext(overrides: Partial<RiskEngineContext>): RiskEngineContext {
  return {
    documentId: "doc-1",
    documentType: "RESIDENTIAL_RENTAL",
    clauses: [],
    entities: [],
    ...overrides,
  };
}

describe("Pass 1: liability shift (category 1)", () => {
  it("flags structural repairs borne by the Tenant", () => {
    const findings = runPass1(
      makeContext({
        documentType: "RESIDENTIAL_RENTAL",
        clauses: [
          {
            id: "c1",
            clauseType: "MAINTENANCE",
            clauseNumber: "4",
            text:
              "4. MAINTENANCE\nThe Landlord shall be responsible for routine maintenance of the " +
              "premises, while structural repairs shall be borne by the Tenant.",
            textStart: 0,
            textEnd: 100,
          },
        ],
      }),
    );
    const liabilityShift = findings.filter((f) => f.category === "LIABILITY_SHIFT");
    expect(liabilityShift).toHaveLength(1);
    expect(liabilityShift[0].pass).toBe("PASS_1");
    expect(liabilityShift[0].evidence).toHaveLength(1);
    expect(liabilityShift[0].evidence[0].sourceId).toBe("c1");
  });

  it("does not flag structural repairs borne by the Landlord (the normal allocation)", () => {
    const findings = runPass1(
      makeContext({
        clauses: [
          {
            id: "c1",
            clauseType: "MAINTENANCE",
            clauseNumber: "4",
            text:
              "4. MAINTENANCE\nThe Tenant shall be responsible for routine maintenance of the " +
              "premises, while structural repairs shall be borne by the Landlord.",
            textStart: 0,
            textEnd: 100,
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.category === "LIABILITY_SHIFT")).toHaveLength(0);
  });
});

describe("Pass 1: unbounded discretion (category 3)", () => {
  it("flags deposit deductions left to the Landlord's sole discretion", () => {
    const findings = runPass1(
      makeContext({
        clauses: [
          {
            id: "c1",
            clauseType: "SECURITY_DEPOSIT",
            clauseNumber: "3",
            text: "3. SECURITY DEPOSIT\nRefundable upon vacation subject to deductions as deemed fit by the Landlord.",
            textStart: 0,
            textEnd: 100,
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.category === "UNBOUNDED_DISCRETION")).toHaveLength(1);
  });

  it("does not flag an itemized, capped deduction standard", () => {
    const findings = runPass1(
      makeContext({
        clauses: [
          {
            id: "c1",
            clauseType: "SECURITY_DEPOSIT",
            clauseNumber: "3",
            text:
              "3. SECURITY DEPOSIT\nRefundable within 30 days, subject to an itemized list of " +
              "deductions not exceeding 10% of the deposit.",
            textStart: 0,
            textEnd: 100,
          },
        ],
      }),
    );
    expect(findings.filter((f) => f.category === "UNBOUNDED_DISCRETION")).toHaveLength(0);
  });
});

describe("Pass 1: missing clause (category 5)", () => {
  it("flags DISPUTE_RESOLUTION missing from an otherwise-complete residential rental document", () => {
    const findings = runPass1(
      makeContext({
        documentType: "RESIDENTIAL_RENTAL",
        clauses: [
          {
            id: "c1",
            clauseType: "LEASE_DURATION",
            clauseNumber: "1",
            text: "x",
            textStart: 0,
            textEnd: 10,
          },
          {
            id: "c2",
            clauseType: "RENT_PAYMENT",
            clauseNumber: "2",
            text: "x",
            textStart: 10,
            textEnd: 20,
          },
          {
            id: "c3",
            clauseType: "SECURITY_DEPOSIT",
            clauseNumber: "3",
            text: "x",
            textStart: 20,
            textEnd: 30,
          },
          {
            id: "c4",
            clauseType: "TERMINATION",
            clauseNumber: "4",
            text: "x",
            textStart: 30,
            textEnd: 40,
          },
          {
            id: "c5",
            clauseType: "JURISDICTION",
            clauseNumber: "5",
            text: "x",
            textStart: 40,
            textEnd: 50,
          },
        ],
      }),
    );
    const missing = findings.filter((f) => f.category === "MISSING_CLAUSE");
    expect(missing).toHaveLength(1);
    expect(missing[0].reason).toContain("dispute resolution");
    expect(missing[0].evidence).toHaveLength(0);
  });

  it("flags nothing when every expected clause is present", () => {
    const findings = runPass1(
      makeContext({
        documentType: "RESIDENTIAL_RENTAL",
        clauses: [
          "LEASE_DURATION",
          "RENT_PAYMENT",
          "SECURITY_DEPOSIT",
          "TERMINATION",
          "DISPUTE_RESOLUTION",
          "JURISDICTION",
        ].map((clauseType, i) => ({
          id: `c${i}`,
          clauseType,
          clauseNumber: String(i + 1),
          text: "x",
          textStart: i * 10,
          textEnd: i * 10 + 5,
        })),
      }),
    );
    expect(findings.filter((f) => f.category === "MISSING_CLAUSE")).toHaveLength(0);
  });

  it("uses the land_lease expected-clause set for land_lease documents", () => {
    const findings = runPass1(
      makeContext({
        documentType: "LAND_LEASE",
        clauses: [
          {
            id: "c1",
            clauseType: "LEASE_DURATION",
            clauseNumber: "1",
            text: "x",
            textStart: 0,
            textEnd: 10,
          },
        ],
      }),
    );
    const missingTypes = findings
      .filter((f) => f.category === "MISSING_CLAUSE")
      .map((f) => f.reason);
    // LAND_USE_RESTRICTION and LEASE_PREMIUM are land_lease-specific
    // expectations that would never appear in the residential_rental set.
    expect(missingTypes.some((r) => r.includes("land use restriction"))).toBe(true);
    expect(missingTypes.some((r) => r.includes("lease premium"))).toBe(true);
  });
});
