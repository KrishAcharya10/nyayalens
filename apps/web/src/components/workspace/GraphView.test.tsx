import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GraphView } from "./GraphView";
import type { DocumentGraph, GraphEdge, GraphNode } from "@/lib/apiTypes";

const node = (
  id: string,
  type: GraphNode["type"],
  label: string,
  text: string | null = null,
  textStart: number | null = null,
): GraphNode => ({
  id,
  type,
  label,
  text,
  textStart,
  textEnd: textStart === null ? null : textStart + 20,
});
const edge = (type: GraphEdge["type"], from: string, to: string, label?: string): GraphEdge => ({
  type,
  from,
  to,
  ...(label ? { label } : {}),
});

// A small lease: a clause, a few entities (one connected to nothing), a duty
// with its party, and a finding - shaped exactly like GET /documents/:id/graph.
const GRAPH: DocumentGraph = {
  documentId: "doc-1",
  modelSource: "RULE_BASED",
  nodes: [
    node("document:doc-1", "DOCUMENT", "RESIDENTIAL_RENTAL"),
    node(
      "clause:c1",
      "CLAUSE",
      "RENT_PAYMENT",
      "2. RENT PAYMENT\nThe Tenant shall pay Rs 30000.",
      0,
    ),
    node("entity:rent", "ENTITY", "RENT", "Rs 30000", 40),
    node("entity:tenant", "ENTITY", "TENANT", "Rohan Shah", 5),
    node("entity:deposit", "ENTITY", "SECURITY_DEPOSIT", "Rs 90000", 80),
    node("obligation:o1", "OBLIGATION", "PAY", "The Tenant shall pay Rs 30000 monthly.", 25),
    node("risk:r1", "RISK_FINDING", "UNBOUNDED_DISCRETION"),
  ],
  edges: [
    edge("HAS_CLAUSE", "document:doc-1", "clause:c1"),
    edge("HAS_ENTITY", "document:doc-1", "entity:rent"),
    edge("HAS_ENTITY", "document:doc-1", "entity:tenant"),
    edge("HAS_ENTITY", "document:doc-1", "entity:deposit"),
    edge("REFERENCES", "clause:c1", "entity:rent"),
    edge("RELATION", "entity:tenant", "entity:rent", "MUST_PAY"),
    edge("MUST_PERFORM", "entity:tenant", "obligation:o1", "MUST_PAY"),
    edge("REFERENCES", "obligation:o1", "entity:rent"),
    edge("FLAGS", "risk:r1", "clause:c1"),
  ],
};

// React Flow keeps nodes `visibility:hidden` until it has measured them, and
// jsdom measures nothing, so nodes are found by their accessible name rather
// than by role. A single fireEvent.click is used (not userEvent's full pointer
// sequence) because d3-zoom, which React Flow mounts on the pane, expects a
// populated event.view that jsdom does not provide.
const nodeNamed = (name: RegExp) => screen.getByLabelText(name);
const hasNode = (name: RegExp) => screen.queryByLabelText(name) !== null;

describe("GraphView", () => {
  it("opens on the key facts: connected entities, duties and findings - not the document, clauses or isolated entities", () => {
    render(<GraphView graph={GRAPH} />);
    expect(hasNode(/^Entity: Rent, Rs 30000/)).toBe(true);
    expect(hasNode(/^Entity: Tenant, Rohan Shah/)).toBe(true);
    expect(hasNode(/^Obligation: Tenant must pay/)).toBe(true);
    expect(hasNode(/^Risk finding: Unbounded Discretion/)).toBe(true);
    expect(hasNode(/^Clause:/)).toBe(false);
    expect(hasNode(/^Document:/)).toBe(false);
    expect(hasNode(/Security Deposit/)).toBe(false);
    expect(screen.getByText(/1 entity with no relations is hidden/)).toBeInTheDocument();
  });

  it("names an obligation by its party, taken from the graph's own edges", () => {
    render(<GraphView graph={GRAPH} />);
    expect(nodeNamed(/^Obligation: Tenant must pay/)).toBeInTheDocument();
  });

  it("offers a filter for each kind of node present, with its count", () => {
    render(<GraphView graph={GRAPH} />);
    const filters = screen.getByRole("group", { name: "Show node types" });
    for (const label of [/Entities 3/, /Clauses 1/, /Obligations 1/, /Risk findings 1/]) {
      expect(within(filters).getByRole("button", { name: label })).toBeInTheDocument();
    }
    // No Deadlines / Legal references in this graph, so no chip for them.
    expect(within(filters).queryByRole("button", { name: /Deadlines/ })).toBeNull();
  });

  it("brings clauses in when their filter is switched on, and the document when document links are", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    const chip = screen.getByRole("button", { name: /Clauses 1/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(hasNode(/^Clause: Rent Payment, 2\. RENT PAYMENT/)).toBe(true);
    await user.click(screen.getByLabelText("Document links"));
    expect(hasNode(/^Document:/)).toBe(true);
  });

  it("shows the isolated entity once 'Key facts only' is switched off", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    await user.click(screen.getByLabelText("Key facts only"));
    expect(hasNode(/Security Deposit, Rs 90000/)).toBe(true);
    expect(screen.queryByText(/with no relations/)).toBeNull();
  });

  it("selecting a node opens its details: kind, title, source text and connections", () => {
    render(<GraphView graph={GRAPH} />);
    fireEvent.click(nodeNamed(/^Entity: Rent, Rs 30000/));
    const details = screen.getByRole("complementary", { name: "Selected item" });
    expect(within(details).getByText("Entity")).toBeInTheDocument();
    expect(within(details).getByRole("heading", { name: "Rent" })).toBeInTheDocument();
    expect(within(details).getByText("Rs 30000")).toBeInTheDocument();
    // The rent is stated by the tenant's relation, mentioned by the duty, and in a clause.
    expect(within(details).getByText(/Connected to \(\d+\)/)).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: /Tenant must pay this/ }),
    ).toBeInTheDocument();
    expect(nodeNamed(/^Entity: Rent/)).toHaveAttribute("aria-pressed", "true");
  });

  it("follows a connection: choosing a neighbour in the details selects it, even one the filters hide", () => {
    render(<GraphView graph={GRAPH} />);
    fireEvent.click(nodeNamed(/^Entity: Rent/));
    const details = screen.getByRole("complementary", { name: "Selected item" });
    // The clause is hidden by default; following the link switches that filter on.
    fireEvent.click(within(details).getByRole("button", { name: /Rent Payment mentions this/ }));
    expect(hasNode(/^Clause: Rent Payment/)).toBe(true);
    expect(
      within(screen.getByRole("complementary", { name: "Selected item" })).getByRole("heading", {
        name: "Rent Payment",
      }),
    ).toBeInTheDocument();
  });

  it("'Show in document' passes the evidence ids a node stands for", () => {
    const onShowInDocument = vi.fn();
    render(
      <GraphView
        graph={GRAPH}
        onShowInDocument={onShowInDocument}
        clauseAt={() => "clause-row-1"}
      />,
    );
    fireEvent.click(nodeNamed(/^Obligation: Tenant must pay/));
    fireEvent.click(screen.getByRole("button", { name: "Show in document" }));
    expect(onShowInDocument).toHaveBeenCalledTimes(1);
    const target = onShowInDocument.mock.calls[0]![0] as {
      clauseIds: string[];
      entityIds: string[];
    };
    expect(target.entityIds.sort()).toEqual(["rent", "tenant"]);
    expect(target.clauseIds).toEqual(["clause-row-1"]);
  });

  it("'Open in <tab>' hands back the node, and is offered only for nodes with a tab", () => {
    const onOpenInTab = vi.fn();
    render(<GraphView graph={GRAPH} onOpenInTab={onOpenInTab} onShowInDocument={() => {}} />);
    fireEvent.click(nodeNamed(/^Entity: Tenant/));
    fireEvent.click(screen.getByRole("button", { name: "Open in Entities" }));
    expect(onOpenInTab).toHaveBeenCalledWith(expect.objectContaining({ id: "entity:tenant" }));
  });

  it("a node with no document location says so instead of offering a dead button", () => {
    render(<GraphView graph={GRAPH} onShowInDocument={() => {}} />);
    // Show the document node, which has no source text.
    fireEvent.click(screen.getByLabelText("Document links"));
    fireEvent.click(nodeNamed(/^Document:/));
    expect(screen.getByRole("button", { name: "No document location" })).toBeDisabled();
  });

  it("nodes are keyboard-operable buttons: Enter selects, and selecting again clears", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    const tenant = nodeNamed(/^Entity: Tenant/);
    tenant.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("complementary", { name: "Selected item" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("complementary", { name: "Selected item" })).toBeNull();
  });

  it("closes the details with the Close button", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    fireEvent.click(nodeNamed(/^Entity: Rent/));
    await user.click(screen.getByRole("button", { name: /Close details/ }));
    expect(screen.queryByRole("complementary", { name: "Selected item" })).toBeNull();
  });

  it("has labelled zoom, fit and reset controls that do not throw", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    const controls = screen.getByRole("group", { name: "View controls" });
    for (const name of ["Zoom out", "Zoom in", "Fit graph to view", "Reset view"]) {
      await user.click(within(controls).getByRole("button", { name }));
    }
    expect(nodeNamed(/^Entity: Rent/)).toBeInTheDocument();
  });

  it("Reset returns the filters and selection to their defaults", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    await user.click(screen.getByRole("button", { name: /Clauses 1/ }));
    fireEvent.click(nodeNamed(/^Entity: Rent/));
    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByRole("button", { name: /Clauses 1/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("complementary", { name: "Selected item" })).toBeNull();
  });

  it("explains what the colours and lines mean, and only for what is in this graph", async () => {
    const user = userEvent.setup();
    render(<GraphView graph={GRAPH} />);
    await user.click(screen.getByText("Legend"));
    const legend = screen.getByText("Hide legend").closest("details")!;
    expect(within(legend).getByText(/A party, amount, date or other value/)).toBeInTheDocument();
    expect(within(legend).getByText(/must perform/)).toBeInTheDocument();
    expect(within(legend).queryByText(/relevant to/)).toBeNull(); // no legal reference here
  });

  it("describes a legal reference as context, never as applying", () => {
    render(
      <GraphView
        graph={{
          ...GRAPH,
          nodes: [
            ...GRAPH.nodes,
            node(
              "legal:tpa",
              "LEGAL_REFERENCE",
              "Transfer of Property Act, 1882 - s.54",
              "Reference metadata (UNVERIFIED).",
            ),
          ],
          edges: [...GRAPH.edges, edge("RELEVANT_TO", "legal:tpa", "document:doc-1")],
        }}
        initialHidden={[]}
      />,
    );
    fireEvent.click(nodeNamed(/^Legal reference: Transfer of Property Act/));
    const details = screen.getByRole("complementary", { name: "Selected item" });
    expect(within(details).getByText("Reference metadata")).toBeInTheDocument();
    expect(within(details).getByText(/UNVERIFIED/)).toBeInTheDocument();
    expect(screen.queryByText(/applies to/i)).toBeNull();
  });

  describe("when there is nothing to draw", () => {
    it("says so - never a fabricated node - while the graph is null or undefined", () => {
      for (const graph of [null, undefined]) {
        const { unmount } = render(<GraphView graph={graph} />);
        expect(
          screen.getByText("Not enough extracted data yet to build a graph."),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(/^(Entity|Clause|Obligation):/)).toBeNull();
        unmount();
      }
    });

    it("says so for a graph that holds only the document", () => {
      render(<GraphView graph={{ ...GRAPH, nodes: [GRAPH.nodes[0]!], edges: [] }} />);
      expect(
        screen.getByText("Not enough extracted data yet to build a graph."),
      ).toBeInTheDocument();
    });

    it("offers a way out when the filters hide everything", async () => {
      const user = userEvent.setup();
      render(<GraphView graph={GRAPH} />);
      for (const name of [/Entities 3/, /Obligations 1/, /Risk findings 1/]) {
        await user.click(screen.getByRole("button", { name }));
      }
      expect(screen.getByText("Nothing to show with the current filters.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Reset filters" }));
      expect(hasNode(/^Entity: Rent/)).toBe(true);
    });
  });

  describe("with malformed data", () => {
    const messy = {
      documentId: "doc-1",
      modelSource: "RULE_BASED",
      nodes: [
        node("entity:ok", "ENTITY", "RENT", "Rs 1"),
        node("entity:ok", "ENTITY", "RENT", "duplicate"),
        { id: "", type: "ENTITY", label: "x" },
        { id: "z", type: "MYSTERY", label: "x" },
        null,
        node("entity:also", "ENTITY", "TENANT", "A"),
      ],
      edges: [
        { type: "RELATION", from: "entity:ok", to: "entity:also", label: "MUST_PAY" },
        { type: "RELATION", from: "entity:ok", to: "entity:missing" },
        { type: "RELATION", from: "entity:ok" },
        undefined,
      ],
    } as unknown as DocumentGraph;

    it("draws what is valid, does not crash, and reports what it ignored", () => {
      render(<GraphView graph={messy} />);
      expect(hasNode(/^Entity: Rent, Rs 1/)).toBe(true);
      expect(hasNode(/duplicate/)).toBe(false);
      expect(screen.getByText(/malformed items were ignored/)).toBeInTheDocument();
      fireEvent.click(nodeNamed(/^Entity: Rent/));
      expect(screen.getByRole("complementary", { name: "Selected item" })).toBeInTheDocument();
    });

    it("copes with a body that has no arrays at all", () => {
      expect(() => render(<GraphView graph={{} as DocumentGraph} />)).not.toThrow();
      expect(
        screen.getByText("Not enough extracted data yet to build a graph."),
      ).toBeInTheDocument();
    });
  });

  it("handles a large graph without throwing and still lists every kind of node", () => {
    const entities = Array.from({ length: 120 }, (_, i) =>
      node(`entity:e${i}`, "ENTITY", "AMOUNT", `Rs ${i}`, i),
    );
    const relations = entities
      .slice(1)
      .map((e, i) => edge("RELATION", `entity:e${i}`, e.id, "MUST_PAY"));
    render(
      <GraphView
        graph={{
          ...GRAPH,
          nodes: [...GRAPH.nodes, ...entities],
          edges: [...GRAPH.edges, ...relations],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: /Entities 123/ })).toBeInTheDocument();
    expect(hasNode(/^Entity: Amount, Rs 60/)).toBe(true);
  });
});
