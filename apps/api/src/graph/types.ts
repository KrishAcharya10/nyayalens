// Knowledge graph node/edge shapes (Phase 7A). A relational representation
// queried graph-style, not a separate graph database - see
// docs/architecture/knowledge_graph.md for why. Built at read-time from
// already-persisted entities/document_clauses/risks; nothing here is
// itself persisted.

export type GraphNodeType = "DOCUMENT" | "ENTITY" | "CLAUSE" | "RISK_FINDING";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  // ENTITY: the entity label (e.g. "RENT"). CLAUSE: the clause type (e.g.
  // "RENT_PAYMENT"). RISK_FINDING: the risk category. DOCUMENT: the
  // document type.
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export type GraphEdgeType = "HAS_ENTITY" | "HAS_CLAUSE" | "REFERENCES" | "FLAGS" | "COMPARED_WITH";

export interface GraphEdge {
  type: GraphEdgeType;
  from: string;
  to: string;
}

export interface DocumentGraph {
  documentId: string;
  modelSource: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphClauseInput {
  id: string;
  clauseType: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export interface GraphEntityInput {
  id: string;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export type GraphEvidenceSourceTable = "document_clauses" | "entities";

export interface GraphEvidenceInput {
  sourceTable: GraphEvidenceSourceTable;
  sourceId: string;
}

export interface GraphRiskInput {
  id: string;
  category: string;
  evidence: GraphEvidenceInput[];
}

export interface BuildGraphInput {
  documentId: string;
  documentType: string;
  modelSource: string;
  clauses: GraphClauseInput[];
  entities: GraphEntityInput[];
  risks: GraphRiskInput[];
}
