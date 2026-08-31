import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityTab } from "./EntityTab";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import type { Entity } from "@/lib/apiTypes";

function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: "e1",
    documentId: "doc-1",
    label: "RENT",
    text: "Rs 30000",
    textStart: 0,
    textEnd: 8,
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

function renderTab(entities: Entity[]) {
  return render(
    <EvidenceFocusProvider>
      <EntityTab entities={entities} />
    </EvidenceFocusProvider>,
  );
}

describe("EntityTab (Phase 7B, Section 15)", () => {
  it("shows the exact required empty state when there are no entities", () => {
    renderTab([]);
    expect(screen.getByText("No entities were extracted.")).toBeInTheDocument();
  });

  it("renders rule_based entities as the default reliable view", () => {
    renderTab([makeEntity({})]);
    expect(screen.getByText("Rs 30000")).toBeInTheDocument();
  });

  it("visually distinguishes a generic_transformer entity and never presents it as equally reliable as rule_based", () => {
    renderTab([
      makeEntity({ id: "e-rb", modelSource: "RULE_BASED", text: "Rs 30000" }),
      makeEntity({
        id: "e-gt",
        modelSource: "GENERIC_TRANSFORMER",
        label: "GENERIC_PER",
        text: "Someone",
      }),
    ]);
    expect(screen.getByText("Generic transformer")).toBeInTheDocument();
    expect(screen.getByText(/Other model sources \(experimental/)).toBeInTheDocument();
  });
});
