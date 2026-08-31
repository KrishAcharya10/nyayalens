import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphView } from "./GraphView";
import type { DocumentGraph } from "@/lib/apiTypes";

const GRAPH: DocumentGraph = {
  documentId: "doc-1",
  modelSource: "RULE_BASED",
  nodes: [
    {
      id: "document:doc-1",
      type: "DOCUMENT",
      label: "RESIDENTIAL_RENTAL",
      text: null,
      textStart: null,
      textEnd: null,
    },
    {
      id: "clause:c1",
      type: "CLAUSE",
      label: "RENT_PAYMENT",
      text: "2. RENT PAYMENT...",
      textStart: 0,
      textEnd: 50,
    },
    {
      id: "entity:e1",
      type: "ENTITY",
      label: "RENT",
      text: "Rs 30000",
      textStart: 10,
      textEnd: 18,
    },
    {
      id: "risk:r1",
      type: "RISK_FINDING",
      label: "UNBOUNDED_DISCRETION",
      text: null,
      textStart: null,
      textEnd: null,
    },
  ],
  edges: [
    { type: "HAS_CLAUSE", from: "document:doc-1", to: "clause:c1" },
    { type: "HAS_ENTITY", from: "document:doc-1", to: "entity:e1" },
    { type: "REFERENCES", from: "clause:c1", to: "entity:e1" },
    { type: "FLAGS", from: "risk:r1", to: "clause:c1" },
  ],
};

describe("GraphView (Phase 7B, Section 18)", () => {
  it("renders a node per graph node from real API-shaped data, distinguishing node types", () => {
    render(<GraphView graph={GRAPH} onSelectNode={vi.fn()} />);
    // reactflow renders node labels as text content.
    expect(screen.getByText("Rent Payment")).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Unbounded Discretion")).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();
  });

  it("shows a loading empty state, never fabricated nodes, while the graph is still null", () => {
    render(<GraphView graph={null} onSelectNode={vi.fn()} />);
    expect(screen.getByText("Loading graph...")).toBeInTheDocument();
  });

  it("calls onSelectNode with the real GraphNode when a node is clicked", () => {
    const onSelectNode = vi.fn();
    render(<GraphView graph={GRAPH} onSelectNode={onSelectNode} />);

    // fireEvent.click (a single synthetic click), not userEvent.click - the
    // latter simulates a full real pointer-down/up sequence, which trips
    // reactflow's pane-level d3-zoom pan handler on a jsdom incompatibility
    // (it expects a populated event.view). This doesn't reflect a problem
    // with GraphView's own click handling, only a jsdom/d3 event-simulation
    // gap - real pan/zoom stays fully enabled in the component itself.
    fireEvent.click(screen.getByText("Rent Payment"));
    expect(onSelectNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clause:c1", type: "CLAUSE" }),
    );
  });
});
