// Knowledge graph node/edge shapes (Phase 7A). A relational representation
// queried graph-style, not a separate graph database - see
// docs/architecture/knowledge_graph.md for why. Built at read-time from
// already-persisted entities/document_clauses/risks; nothing here is
// itself persisted.

// Phase 8 adds OBLIGATION (ACTOR must ACTION), EVENT (a dated deadline)
// and LEGAL_REFERENCE (unverified reference metadata from the DomainPack).
export type GraphNodeType =
  "DOCUMENT" | "ENTITY" | "CLAUSE" | "RISK_FINDING" | "OBLIGATION" | "EVENT" | "LEGAL_REFERENCE";

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
  /** Phase 8: the entity's core type (PARTY, MONEY, ...) when it is an ENTITY node. */
  category?: string;
}

// Phase 8: RELATION edges carry the relation type (SELLS, MUST_PAY, ...)
// in `label`; CONTRADICTS links values a consistency finding found in
// conflict; RELEVANT_TO links a legal reference to the document - never
// "APPLIES_TO", which would assert legal applicability
// (docs/legal_reference_policy.md).
export type GraphEdgeType =
  | "HAS_ENTITY"
  | "HAS_CLAUSE"
  | "REFERENCES"
  | "FLAGS"
  | "COMPARED_WITH"
  | "RELATION"
  | "HAS_OBLIGATION"
  | "MUST_PERFORM"
  | "DUE_ON"
  | "CONTRADICTS"
  | "RELEVANT_TO";

export interface GraphEdge {
  type: GraphEdgeType;
  from: string;
  to: string;
  /** RELATION: the relation type; MUST_PERFORM: MUST_<action>. */
  label?: string;
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
  /** Phase 8: CONSISTENCY findings also draw CONTRADICTS edges between their values. */
  pass?: string;
}

export interface GraphRelationInput {
  relationType: string;
  /** Null = the document itself. */
  subjectEntityId: string | null;
  objectEntityId: string;
}

export interface GraphObligationInput {
  id: string;
  action: string;
  actorEntityId: string | null;
  amountEntityId: string | null;
  deadline: string | null;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export interface GraphLegalReferenceInput {
  id: string;
  title: string;
  verification: string;
}

export interface BuildGraphInput {
  documentId: string;
  documentType: string;
  modelSource: string;
  clauses: GraphClauseInput[];
  entities: GraphEntityInput[];
  risks: GraphRiskInput[];
  // Phase 8 (all optional, so Phase 7A callers are unchanged)
  entityCategories?: Record<string, string>;
  relations?: GraphRelationInput[];
  obligations?: GraphObligationInput[];
  legalReferences?: GraphLegalReferenceInput[];
}
