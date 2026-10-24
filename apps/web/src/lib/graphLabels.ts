// How the knowledge graph names and colours things. One place, used by the
// nodes, the legend and the details panel so they cannot drift apart.
import type { GraphEdge, GraphNode, GraphNodeType } from "./apiTypes";
import { humanizeLabel } from "./format";
import type { Neighbour } from "./graphModel";

export interface NodeStyle {
  /** Node fill, border and text; text meets 4.5:1 on the fill. */
  bg: string;
  border: string;
  text: string;
  /** The saturated colour of the node's left edge and legend swatch. */
  accent: string;
}

export const NODE_STYLE: Record<GraphNodeType, NodeStyle> = {
  DOCUMENT: { bg: "#181d27", border: "#181d27", text: "#fdfcfa", accent: "#d99a3f" },
  CLAUSE: { bg: "#eff3fa", border: "#c3d3ec", text: "#274a80", accent: "#2f5aa0" },
  ENTITY: { bg: "#fbeed9", border: "#eec583", text: "#7a4f12", accent: "#d99a3f" },
  OBLIGATION: { bg: "#eef7f1", border: "#b7dcc4", text: "#24603a", accent: "#3a7a3f" },
  EVENT: { bg: "#f4f0fa", border: "#d3c6ea", text: "#4f3a80", accent: "#7a5ab0" },
  RISK_FINDING: { bg: "#fdf1f1", border: "#eec3c3", text: "#8a2222", accent: "#b42323" },
  LEGAL_REFERENCE: { bg: "#f4f5f7", border: "#cbd1db", text: "#4a5468", accent: "#8a94a8" },
};

export const NODE_KIND: Record<GraphNodeType, { singular: string; plural: string }> = {
  DOCUMENT: { singular: "Document", plural: "Document" },
  CLAUSE: { singular: "Clause", plural: "Clauses" },
  ENTITY: { singular: "Entity", plural: "Entities" },
  OBLIGATION: { singular: "Obligation", plural: "Obligations" },
  EVENT: { singular: "Deadline", plural: "Deadlines" },
  RISK_FINDING: { singular: "Risk finding", plural: "Risk findings" },
  LEGAL_REFERENCE: { singular: "Legal reference", plural: "Legal references" },
};

/** The workspace tab that shows a node's full record, where there is one. */
export const NODE_TAB: Partial<Record<GraphNodeType, { tab: string; label: string }>> = {
  ENTITY: { tab: "entities", label: "Entities" },
  CLAUSE: { tab: "clauses", label: "Clauses" },
  OBLIGATION: { tab: "obligations", label: "Obligations" },
  EVENT: { tab: "obligations", label: "Obligations" },
  RISK_FINDING: { tab: "risks", label: "Risks" },
};

export interface EdgeKind {
  type: GraphEdge["type"];
  label: string;
  meaning: string;
  stroke: string;
  width: number;
  dash?: string;
  /** Whether the edge carries a text label on the canvas. */
  labelled: boolean;
  /** The edge read as a verb in a sentence: "Tenant <verb> this". */
  verb: string;
}

// Edge meanings, as the legend states them. "relevant to" is deliberate: a
// legal reference is context, never a claim that a law applies
// (docs/legal_reference_policy.md).
export const EDGE_KINDS: EdgeKind[] = [
  {
    type: "RELATION",
    label: "relation",
    meaning: "A stated relationship, e.g. buyer must pay price",
    stroke: "#4a5468",
    width: 1.5,
    labelled: true,
    verb: "relates to",
  },
  {
    type: "MUST_PERFORM",
    label: "must perform",
    meaning: "A party and the duty it carries",
    stroke: "#3a7a3f",
    width: 1.5,
    labelled: true,
    verb: "must perform",
  },
  {
    type: "DUE_ON",
    label: "due",
    meaning: "A duty and its deadline",
    stroke: "#7a5ab0",
    width: 1.5,
    labelled: true,
    verb: "is due on",
  },
  {
    type: "REFERENCES",
    label: "mentions",
    meaning: "A clause, duty or finding that mentions a value",
    stroke: "#8a94a8",
    width: 1,
    dash: "2 3",
    labelled: false,
    verb: "mentions",
  },
  {
    type: "FLAGS",
    label: "flags",
    meaning: "A risk finding and the evidence it cites",
    stroke: "#b42323",
    width: 1.25,
    labelled: false,
    verb: "flags",
  },
  {
    type: "CONTRADICTS",
    label: "contradicts",
    meaning: "Two values the document states differently",
    stroke: "#b42323",
    width: 2.25,
    labelled: true,
    verb: "contradicts",
  },
  {
    type: "COMPARED_WITH",
    label: "compared with",
    meaning: "Two clauses a finding compares",
    stroke: "#2f5aa0",
    width: 1.25,
    dash: "5 3",
    labelled: true,
    verb: "is compared with",
  },
  {
    type: "RELEVANT_TO",
    label: "relevant to",
    meaning: "Reference metadata - unverified, never a claim that a law applies",
    stroke: "#8a94a8",
    width: 1,
    dash: "5 3",
    labelled: true,
    verb: "is relevant to",
  },
  {
    type: "HAS_ENTITY",
    label: "belongs to",
    meaning: "Contained in the document (shown with document links)",
    stroke: "#cbd1db",
    width: 1,
    labelled: false,
    verb: "contains",
  },
];

const EDGE_BY_TYPE = new Map(EDGE_KINDS.map((k) => [k.type, k]));
export const edgeKind = (type: GraphEdge["type"]): EdgeKind =>
  EDGE_BY_TYPE.get(type) ??
  (type === "HAS_CLAUSE" || type === "HAS_OBLIGATION"
    ? EDGE_BY_TYPE.get("HAS_ENTITY")!
    : EDGE_BY_TYPE.get("REFERENCES")!);

/** The edge as a sentence verb - the specific relation if there is one ("must pay"). */
export function edgeVerb(edge: GraphEdge): string {
  if ((edge.type === "RELATION" || edge.type === "MUST_PERFORM") && edge.label) {
    return humanizeLabel(edge.label).toLowerCase();
  }
  return edgeKind(edge.type).verb;
}

/** The text on an edge: the specific relation (SELLS_TO -> "sells to"), else its kind. */
export function edgeLabel(edge: GraphEdge): string {
  if ((edge.type === "RELATION" || edge.type === "MUST_PERFORM") && edge.label) {
    return humanizeLabel(edge.label).toLowerCase();
  }
  return edgeKind(edge.type).label;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** A node's headline: "Sale Consideration", "Buyer must pay", "Financial Contradiction". */
export function nodeTitle(node: GraphNode, neighbours: Neighbour[] = []): string {
  switch (node.type) {
    case "DOCUMENT":
      return "Document";
    case "LEGAL_REFERENCE":
      return node.label; // already a title ("Transfer of Property Act, 1882 - s.54")
    case "OBLIGATION": {
      const actor = neighbours.find((n) => n.edge.type === "MUST_PERFORM" && n.direction === "in");
      const action = `must ${humanizeLabel(node.label).toLowerCase()}`;
      return actor
        ? `${humanizeLabel(actor.node.label)} ${action}`
        : `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
    }
    case "EVENT":
      return "Deadline";
    default:
      return humanizeLabel(node.label);
  }
}

/** The line under the headline: the value an entity holds, a clause's first line, and so on. */
export function nodeValue(node: GraphNode): string | null {
  if (node.type === "RISK_FINDING" || node.type === "DOCUMENT") return null;
  if (node.type === "LEGAL_REFERENCE") return "Unverified reference";
  if (!node.text) return null;
  const first = node.type === "CLAUSE" ? (node.text.split("\n")[0] ?? "") : node.text;
  return oneLine(first) || null;
}
