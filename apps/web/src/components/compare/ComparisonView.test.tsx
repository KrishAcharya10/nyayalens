import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ComparisonView } from "./ComparisonView";
import type { DocumentComparison } from "@/lib/apiTypes";

const v = (text: string) => ({ text, normalized: null, textStart: 0, textEnd: text.length });
const COMPARISON: DocumentComparison = {
  a: { documentId: "a", documentType: "RESIDENTIAL_RENTAL", domain: "residential_rental" },
  b: { documentId: "b", documentType: "RESIDENTIAL_RENTAL", domain: "residential_rental" },
  sameDomain: true,
  fields: [
    {
      label: "RENT",
      displayName: "Rent",
      coreType: "MONEY",
      status: "SAME",
      a: [v("Rs. 25,000")],
      b: [v("INR 25000")],
    },
    {
      label: "SECURITY_DEPOSIT",
      displayName: "Security deposit",
      coreType: "MONEY",
      status: "CHANGED",
      a: [v("Rs. 1,00,000")],
      b: [v("Rs. 1,50,000")],
    },
  ],
  clauses: [{ clauseType: "LOCK_IN", status: "REMOVED", a: { clauseNumber: "7" }, b: null }],
  obligations: [],
  relations: [
    {
      relationType: "MUST_PAY",
      subjectLabel: "TENANT",
      objectLabel: "RENT",
      status: "CHANGED",
      a: ["Rs. 30,000"],
      b: ["Rs. 35,000"],
    },
  ],
  risks: [
    {
      category: "UNBOUNDED_DISCRETION",
      status: "ADDED",
      a: null,
      b: { severity: "MEDIUM", reason: "Potential issue: sole discretion." },
    },
  ],
  summary: { SAME: 1, CHANGED: 2, ADDED: 1, REMOVED: 1 },
};

describe("ComparisonView (Phase 8)", () => {
  it("shows differences first and hides identical items until asked", async () => {
    render(<ComparisonView comparison={COMPARISON} />);
    expect(screen.getByText("Rs. 1,50,000")).toBeInTheDocument();
    expect(screen.getAllByText("Changed")).toHaveLength(2);
    expect(screen.getByText("Only in A")).toBeInTheDocument();
    expect(screen.getByText("Potential issue: sole discretion.")).toBeInTheDocument();
    expect(screen.getByText(/Rs\. 30,000 → Rs\. 35,000/)).toBeInTheDocument();
    expect(screen.queryByText("INR 25000")).toBeNull();
    await userEvent.click(screen.getByLabelText("Show identical items"));
    expect(screen.getByText("INR 25000")).toBeInTheDocument();
  });

  it("notes a cross-domain comparison", () => {
    render(
      <ComparisonView
        comparison={{
          ...COMPARISON,
          sameDomain: false,
          b: { ...COMPARISON.b, domain: "employment" },
        }}
      />,
    );
    expect(screen.getByText(/belong to different domains/)).toBeInTheDocument();
  });
});
