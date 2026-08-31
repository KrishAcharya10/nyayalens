import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentViewer } from "./DocumentViewer";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import type { DocumentClause, Entity } from "@/lib/apiTypes";

function makeClause(overrides: Partial<DocumentClause>): DocumentClause {
  return {
    id: "c1",
    documentId: "doc-1",
    clauseType: "RENT_PAYMENT",
    clauseNumber: "2",
    text: null,
    textStart: 0,
    textEnd: 10,
    pageNumber: null,
    modelSource: "RULE_BASED",
    confidence: null,
    createdAt: "",
    ...overrides,
  };
}
function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: "e1",
    documentId: "doc-1",
    label: "RENT",
    text: null,
    textStart: 0,
    textEnd: 10,
    pageNumber: null,
    bboxX: null,
    bboxY: null,
    bboxWidth: null,
    bboxHeight: null,
    modelSource: "RULE_BASED",
    confidence: null,
    modelName: null,
    modelVersion: null,
    createdAt: "",
    ...overrides,
  };
}

function renderViewer(text: string, clauses: DocumentClause[], entities: Entity[]) {
  return render(
    <EvidenceFocusProvider>
      <DocumentViewer canonicalText={text} clauses={clauses} entities={entities} />
    </EvidenceFocusProvider>,
  );
}

describe("DocumentViewer (Phase 7B)", () => {
  it("renders the document's real canonical text, not fabricated content", () => {
    const text = "1. RENT PAYMENT\nThe Tenant shall pay Rs 30000 per month.";
    renderViewer(text, [], []);
    expect(screen.getByText(/The Tenant shall pay/)).toBeInTheDocument();
  });

  it("wraps a clause's text in a block carrying the clause's DOM id (clause highlighting)", () => {
    const text = "1. RENT PAYMENT\nThe Tenant shall pay Rs 30000 per month.";
    const clause = makeClause({ id: "clause-id-1", textStart: 0, textEnd: text.length });
    const { container } = renderViewer(text, [clause], []);
    expect(container.querySelector("#clause-clause-id-1")).toBeInTheDocument();
  });

  it("wraps an entity's text in a <mark> carrying the entity's DOM id (entity highlighting)", () => {
    const text = "The Tenant shall pay Rs 30000 per month.";
    const start = text.indexOf("Rs 30000");
    const entity = makeEntity({
      id: "entity-id-1",
      label: "RENT",
      text: "Rs 30000",
      textStart: start,
      textEnd: start + "Rs 30000".length,
    });
    const { container } = renderViewer(text, [], [entity]);
    const mark = container.querySelector("#entity-entity-id-1");
    expect(mark).toBeInTheDocument();
    expect(mark?.tagName).toBe("MARK");
    expect(mark?.textContent).toBe("Rs 30000");
  });

  it("handles an entity nested inside a clause without breaking, duplicating, or dropping text", () => {
    const text = "1. RENT PAYMENT\nThe Tenant shall pay Rs 30000 per month.";
    const clause = makeClause({ id: "outer-clause", textStart: 0, textEnd: text.length });
    const entityStart = text.indexOf("Rs 30000");
    const entity = makeEntity({
      id: "inner-entity",
      label: "RENT",
      text: "Rs 30000",
      textStart: entityStart,
      textEnd: entityStart + "Rs 30000".length,
    });
    const { container } = renderViewer(text, [clause], [entity]);

    const clauseEl = container.querySelector("#clause-outer-clause");
    const entityEl = container.querySelector("#entity-inner-entity");
    expect(clauseEl).toBeInTheDocument();
    expect(entityEl).toBeInTheDocument();
    // The entity mark is nested inside the clause block (overlap handled).
    expect(clauseEl?.contains(entityEl)).toBe(true);
    // The full original text is present exactly once - no duplication.
    expect(container.textContent).toBe(text);
  });

  it("shows an empty state rather than a blank area when there is no canonical text", () => {
    render(
      <EvidenceFocusProvider>
        <DocumentViewer canonicalText={null} clauses={[]} entities={[]} />
      </EvidenceFocusProvider>,
    );
    expect(screen.getByText(/Document text not yet available/)).toBeInTheDocument();
  });
});
