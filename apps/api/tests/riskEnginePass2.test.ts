import { describe, expect, it } from "vitest";
import { COMPARISON_CHECKS, runPass2, type ComparisonCheck } from "../src/risk/pass2CrossClause.js";
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

describe("Pass 2: asymmetric obligation (category 2)", () => {
  it("flags a 15 vs 60 day notice-period asymmetry between landlord and tenant", () => {
    const context = makeContext({
      clauses: [
        {
          id: "c1",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "5",
          text: "5. NOTICE PERIOD (LANDLORD)\nThe Landlord may terminate this Agreement by serving a notice period of 15 days in writing to the Tenant.",
          textStart: 0,
          textEnd: 120,
        },
        {
          id: "c2",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "6",
          text: "6. NOTICE PERIOD (TENANT)\nThe Tenant may terminate this Agreement by serving a notice period of 60 days in writing to the Landlord.",
          textStart: 120,
          textEnd: 250,
        },
      ],
      entities: [
        { id: "e1", label: "NOTICE_PERIOD", text: "15 days", textStart: 60, textEnd: 67 },
        { id: "e2", label: "NOTICE_PERIOD", text: "60 days", textStart: 180, textEnd: 187 },
      ],
    });

    const findings = runPass2(context);
    const asymmetric = findings.filter((f) => f.category === "ASYMMETRIC_OBLIGATION");
    expect(asymmetric).toHaveLength(1);
    expect(asymmetric[0].pass).toBe("PASS_2");
    // Evidence must reference BOTH compared clauses, not just one.
    expect(asymmetric[0].evidence).toHaveLength(2);
    expect(asymmetric[0].evidence.map((e) => e.sourceId).sort()).toEqual(["c1", "c2"]);
  });

  it("does not flag symmetric (equal) notice periods", () => {
    const context = makeContext({
      clauses: [
        {
          id: "c1",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "5",
          text: "5. NOTICE PERIOD (LANDLORD)\nThe Landlord may terminate by serving a notice period of 30 days.",
          textStart: 0,
          textEnd: 100,
        },
        {
          id: "c2",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "6",
          text: "6. NOTICE PERIOD (TENANT)\nThe Tenant may terminate by serving a notice period of 30 days.",
          textStart: 100,
          textEnd: 200,
        },
      ],
      entities: [
        { id: "e1", label: "NOTICE_PERIOD", text: "30 days", textStart: 50, textEnd: 57 },
        { id: "e2", label: "NOTICE_PERIOD", text: "30 days", textStart: 150, textEnd: 157 },
      ],
    });
    expect(runPass2(context).filter((f) => f.category === "ASYMMETRIC_OBLIGATION")).toHaveLength(0);
  });

  it("does not flag a single, unpaired notice-period clause", () => {
    const context = makeContext({
      clauses: [
        {
          id: "c1",
          clauseType: "NOTICE_PERIOD",
          clauseNumber: "5",
          text: "5. NOTICE PERIOD (LANDLORD)\nThe Landlord may terminate by serving a notice period of 30 days.",
          textStart: 0,
          textEnd: 100,
        },
      ],
      entities: [{ id: "e1", label: "NOTICE_PERIOD", text: "30 days", textStart: 50, textEnd: 57 }],
    });
    expect(runPass2(context)).toHaveLength(0);
  });
});

describe("Pass 2: land use contradiction (category 4)", () => {
  it("flags Agricultural land use type paired with a warehouse-construction permitted use", () => {
    const context = makeContext({
      documentType: "LAND_LEASE",
      entities: [
        { id: "e1", label: "LAND_USE_TYPE", text: "Agricultural", textStart: 0, textEnd: 12 },
      ],
      clauses: [
        {
          id: "c1",
          clauseType: "LAND_USE_RESTRICTION",
          clauseNumber: "4",
          text: "4. PERMITTED USE\nThe land shall be utilised exclusively for construction of a warehouse facility.",
          textStart: 0,
          textEnd: 100,
        },
      ],
    });
    const findings = runPass2(context);
    const contradiction = findings.filter((f) => f.category === "LAND_USE_CONTRADICTION");
    expect(contradiction).toHaveLength(1);
    expect(contradiction[0].evidence).toHaveLength(2);
    expect(contradiction[0].evidence.map((e) => e.sourceTable).sort()).toEqual([
      "document_clauses",
      "entities",
    ]);
  });

  it("does not flag Agricultural land use type paired with a compatible agricultural use", () => {
    const context = makeContext({
      documentType: "LAND_LEASE",
      entities: [
        { id: "e1", label: "LAND_USE_TYPE", text: "Agricultural", textStart: 0, textEnd: 12 },
      ],
      clauses: [
        {
          id: "c1",
          clauseType: "LAND_USE_RESTRICTION",
          clauseNumber: "4",
          text: "4. PERMITTED USE\nThe land shall be utilised exclusively for cultivation of seasonal crops.",
          textStart: 0,
          textEnd: 100,
        },
      ],
    });
    expect(runPass2(context).filter((f) => f.category === "LAND_USE_CONTRADICTION")).toHaveLength(
      0,
    );
  });

  it("never runs the land-use check for residential_rental documents", () => {
    const context = makeContext({
      documentType: "RESIDENTIAL_RENTAL",
      entities: [
        { id: "e1", label: "LAND_USE_TYPE", text: "Agricultural", textStart: 0, textEnd: 12 },
      ],
      clauses: [
        {
          id: "c1",
          clauseType: "LAND_USE_RESTRICTION",
          clauseNumber: "4",
          text: "construction of a warehouse facility",
          textStart: 0,
          textEnd: 100,
        },
      ],
    });
    expect(runPass2(context).filter((f) => f.category === "LAND_USE_CONTRADICTION")).toHaveLength(
      0,
    );
  });
});

describe("Pass 2 registry extensibility", () => {
  it("runs a newly-registered comparison check standalone, without modifying Pass 1 or any existing Pass 2 check", () => {
    let called = false;
    const throwawayCheck: ComparisonCheck = {
      name: "throwaway_test_check",
      run(context) {
        called = true;
        expect(context.documentId).toBe("doc-1");
        return [
          {
            category: "MISSING_CLAUSE",
            severity: "LOW",
            reason: "test finding from a dynamically-added check - requires review.",
            pass: "PASS_2",
            evidence: [],
          },
        ];
      },
    };

    const context = makeContext({});
    const findings = runPass2(context, [throwawayCheck]);

    expect(called).toBe(true);
    expect(findings).toHaveLength(1);
    // The default registry's own checks are untouched - this call used an
    // explicit, isolated check list rather than the default export.
    expect(COMPARISON_CHECKS.some((c) => c.name === "throwaway_test_check")).toBe(false);
  });
});
