import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClauseTab } from "./ClauseTab";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import type { DocumentClause } from "@/lib/apiTypes";

function makeClause(overrides: Partial<DocumentClause>): DocumentClause {
  return {
    id: "c1",
    documentId: "doc-1",
    clauseType: "RENT_PAYMENT",
    clauseNumber: "2",
    text: "2. RENT PAYMENT\nRs 30000 per month.",
    textStart: 0,
    textEnd: 30,
    pageNumber: null,
    modelSource: "RULE_BASED",
    confidence: null,
    createdAt: "",
    ...overrides,
  };
}

function renderTab(clauses: DocumentClause[]) {
  return render(
    <EvidenceFocusProvider>
      <ClauseTab clauses={clauses} />
    </EvidenceFocusProvider>,
  );
}

describe("ClauseTab (Phase 7B, Section 16)", () => {
  it("shows the exact required empty state when there are no clauses", () => {
    renderTab([]);
    expect(screen.getByText("No clauses were classified.")).toBeInTheDocument();
  });

  it("renders a clause's number, type, and excerpt from real persisted data", () => {
    renderTab([makeClause({})]);
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Rent Payment")).toBeInTheDocument();
    expect(screen.getByText(/Rs 30000 per month/)).toBeInTheDocument();
  });

  it("only shows rule_based clauses, not other model sources", () => {
    renderTab([makeClause({ id: "c-other", modelSource: "GENERIC_TRANSFORMER" })]);
    expect(screen.getByText("No clauses were classified.")).toBeInTheDocument();
  });
});
