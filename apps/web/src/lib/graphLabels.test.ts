import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "./apiTypes";
import { edgeKind, edgeLabel, nodeTitle, nodeValue } from "./graphLabels";
import { neighboursOf, sanitizeGraph } from "./graphModel";

const n = (
  id: string,
  type: GraphNode["type"],
  label: string,
  text: string | null = null,
): GraphNode => ({
  id,
  type,
  label,
  text,
  textStart: null,
  textEnd: null,
});

describe("graph labels", () => {
  it("names an obligation by its actor and action, from the graph's own edges", () => {
    const graph = sanitizeGraph({
      documentId: "d",
      modelSource: "RULE_BASED",
      nodes: [
        n("entity:b", "ENTITY", "BUYER", "Kavya Rao"),
        n("obligation:o", "OBLIGATION", "PAY"),
      ],
      edges: [{ type: "MUST_PERFORM", from: "entity:b", to: "obligation:o", label: "MUST_PAY" }],
    });
    expect(nodeTitle(graph.nodes[1]!, neighboursOf(graph, "obligation:o"))).toBe("Buyer must pay");
    expect(nodeTitle(graph.nodes[1]!, [])).toBe("Must pay");
  });

  it("titles entities, deadlines, risks and legal references", () => {
    expect(nodeTitle(n("e", "ENTITY", "SALE_CONSIDERATION"))).toBe("Sale Consideration");
    expect(nodeTitle(n("v", "EVENT", "DEADLINE"))).toBe("Deadline");
    expect(nodeTitle(n("r", "RISK_FINDING", "FINANCIAL_CONTRADICTION"))).toBe(
      "Financial Contradiction",
    );
    expect(nodeTitle(n("l", "LEGAL_REFERENCE", "Transfer of Property Act, 1882 - s.54"))).toBe(
      "Transfer of Property Act, 1882 - s.54",
    );
  });

  it("shows a single-line value, and marks legal references as unverified", () => {
    expect(nodeValue(n("e", "ENTITY", "RENT", "INR  32,000\n"))).toBe("INR 32,000");
    expect(nodeValue(n("c", "CLAUSE", "TERMINATION", "8. TERMINATION\nEither party may..."))).toBe(
      "8. TERMINATION",
    );
    expect(nodeValue(n("r", "RISK_FINDING", "X"))).toBeNull();
    expect(nodeValue(n("l", "LEGAL_REFERENCE", "TPA"))).toBe("Unverified reference");
  });

  it("labels edges by their specific relation, and never says a legal reference 'applies'", () => {
    const rel: GraphEdge = { type: "RELATION", from: "a", to: "b", label: "SELLS_TO" };
    expect(edgeLabel(rel)).toBe("sells to");
    expect(edgeLabel({ type: "RELEVANT_TO", from: "a", to: "b" })).toBe("relevant to");
    expect(edgeKind("RELEVANT_TO").meaning).toMatch(/never a claim/i);
    // An edge type the legend does not know falls back rather than throwing.
    expect(edgeKind("SOMETHING_NEW" as GraphEdge["type"]).label).toBeTruthy();
  });
});
