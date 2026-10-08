import { describe, expect, it } from "vitest";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { compareDocuments, type CompareSide } from "../src/semantic/compare.js";

const registry = getDomainPackRegistry();
const rental = registry.forDocumentType("RESIDENTIAL_RENTAL");
const sale = registry.forDocumentType("AGREEMENT_TO_SELL");

function side(over: Partial<CompareSide>): CompareSide {
  return {
    documentId: "a",
    documentType: "RESIDENTIAL_RENTAL",
    pack: rental,
    entities: [],
    clauses: [],
    obligations: [],
    risks: [],
    ...over,
  };
}
const ent = (id: string, label: string, text: string, textStart = 0) => ({
  id,
  label,
  text,
  textStart,
  textEnd: textStart + text.length,
});

describe("compareDocuments", () => {
  it("compares normalized values: same rent in different notation is SAME, a changed deposit is CHANGED", () => {
    const a = side({
      entities: [ent("1", "RENT", "Rs. 25,000"), ent("2", "SECURITY_DEPOSIT", "Rs. 1,00,000", 50)],
    });
    const b = side({
      documentId: "b",
      entities: [ent("3", "RENT", "INR 25000"), ent("4", "SECURITY_DEPOSIT", "Rs. 1,50,000", 50)],
    });
    const cmp = compareDocuments(a, b);
    const f = (l: string) => cmp.fields.find((x) => x.label === l)!;
    expect(f("RENT").status).toBe("SAME");
    expect(f("SECURITY_DEPOSIT").status).toBe("CHANGED");
    expect(f("SECURITY_DEPOSIT").b[0]!.normalized).toEqual({ amount: 150000, currency: "INR" });
    expect(cmp.sameDomain).toBe(true);
  });

  it("marks fields, clauses, obligations and risks present on one side only as ADDED/REMOVED", () => {
    const clause = (id: string, clauseType: string, text: string) => ({
      id,
      clauseType,
      clauseNumber: "1",
      text,
      textStart: 0,
      textEnd: text.length,
    });
    const a = side({
      entities: [ent("1", "LOCK_IN_PERIOD", "11 months")],
      clauses: [
        clause("c1", "LOCK_IN", "Lock-in of 11 months."),
        clause("c2", "TERMINATION", "Either party may terminate."),
      ],
      risks: [{ id: "r1", category: "UNBOUNDED_DISCRETION", severity: "MEDIUM", reason: "x" }],
    });
    const b = side({
      documentId: "b",
      clauses: [clause("c3", "TERMINATION", "Only the Landlord may terminate.")],
      obligations: [
        {
          actorLabel: "TENANT",
          action: "PAY",
          amountInr: 25000,
          deadlineText: null,
          evidenceText: "",
          textStart: 0,
          textEnd: 1,
        },
      ],
    });
    const cmp = compareDocuments(a, b);
    expect(cmp.fields.find((x) => x.label === "LOCK_IN_PERIOD")!.status).toBe("REMOVED");
    expect(cmp.clauses.find((c) => c.clauseType === "LOCK_IN")!.status).toBe("REMOVED");
    expect(cmp.clauses.find((c) => c.clauseType === "TERMINATION")!.status).toBe("CHANGED");
    expect(cmp.obligations).toEqual([
      expect.objectContaining({ actorLabel: "TENANT", action: "PAY", status: "ADDED" }),
    ]);
    expect(cmp.risks).toEqual([
      expect.objectContaining({ category: "UNBOUNDED_DISCRETION", status: "REMOVED" }),
    ]);
    expect(cmp.summary.REMOVED).toBe(3);
    expect(cmp.summary.ADDED).toBe(1);
  });

  it("compares relations on the related value's normalized form", () => {
    const rel = (objectText: string) => ({
      relationType: "MUST_PAY",
      subjectLabel: "TENANT",
      objectLabel: "RENT",
      objectText,
    });
    const a = side({ relations: [rel("Rs. 30,000")] });
    expect(
      compareDocuments(a, side({ documentId: "b", relations: [rel("INR 30000")] })).relations,
    ).toEqual([expect.objectContaining({ relationType: "MUST_PAY", status: "SAME" })]);
    const changed = compareDocuments(a, side({ documentId: "b", relations: [rel("Rs. 35,000")] }));
    expect(changed.relations[0]).toEqual(
      expect.objectContaining({ status: "CHANGED", a: ["Rs. 30,000"], b: ["Rs. 35,000"] }),
    );
    expect(compareDocuments(a, side({ documentId: "b" })).relations[0]!.status).toBe("REMOVED");
  });

  it("compares parties as sets and reports cross-domain comparisons", () => {
    const a = side({
      documentType: "AGREEMENT_TO_SELL",
      pack: sale,
      entities: [ent("1", "BUYER", "Asha Rao"), ent("2", "BUYER", "Vikram Shah", 40)],
    });
    const b = side({
      documentId: "b",
      documentType: "AGREEMENT_TO_SELL",
      pack: sale,
      entities: [ent("3", "BUYER", "Vikram Shah"), ent("4", "BUYER", "Asha Rao", 40)],
    });
    expect(compareDocuments(a, b).fields.find((x) => x.label === "BUYER")!.status).toBe("SAME");
    expect(compareDocuments(a, side({ documentId: "c" })).sameDomain).toBe(false);
  });
});
