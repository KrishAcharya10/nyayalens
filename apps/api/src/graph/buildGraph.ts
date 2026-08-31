// Builds a document's knowledge graph from already-persisted
// entities/document_clauses/risks - read-time construction, no separate
// graph store to keep in sync (see docs/architecture/knowledge_graph.md).
// Pure function: same input always produces the same graph, which is what
// apps/api/tests/graphBuilder.test.ts asserts against hand-built fixtures.
import type {
  BuildGraphInput,
  DocumentGraph,
  GraphClauseInput,
  GraphEdge,
  GraphEntityInput,
  GraphNode,
} from "./types.js";

function documentNodeId(documentId: string): string {
  return `document:${documentId}`;
}
function entityNodeId(entityId: string): string {
  return `entity:${entityId}`;
}
function clauseNodeId(clauseId: string): string {
  return `clause:${clauseId}`;
}
function riskNodeId(riskId: string): string {
  return `risk:${riskId}`;
}

// A clause "contains" an entity when the entity's span falls entirely
// within the clause's span - both spans must be known (non-null) offsets
// into the same canonical_text. This is the co-location rule REFERENCES
// edges are built from.
function entityWithinClause(entity: GraphEntityInput, clause: GraphClauseInput): boolean {
  if (
    entity.textStart === null ||
    entity.textEnd === null ||
    clause.textStart === null ||
    clause.textEnd === null
  ) {
    return false;
  }
  return entity.textStart >= clause.textStart && entity.textEnd <= clause.textEnd;
}

export function buildDocumentGraph(input: BuildGraphInput): DocumentGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({
    id: documentNodeId(input.documentId),
    type: "DOCUMENT",
    label: input.documentType,
    text: null,
    textStart: null,
    textEnd: null,
  });

  const clauseIds = new Set<string>();
  for (const clause of input.clauses) {
    clauseIds.add(clause.id);
    nodes.push({
      id: clauseNodeId(clause.id),
      type: "CLAUSE",
      label: clause.clauseType,
      text: clause.text,
      textStart: clause.textStart,
      textEnd: clause.textEnd,
    });
    edges.push({
      type: "HAS_CLAUSE",
      from: documentNodeId(input.documentId),
      to: clauseNodeId(clause.id),
    });
  }

  const entityIds = new Set<string>();
  for (const entity of input.entities) {
    entityIds.add(entity.id);
    nodes.push({
      id: entityNodeId(entity.id),
      type: "ENTITY",
      label: entity.label,
      text: entity.text,
      textStart: entity.textStart,
      textEnd: entity.textEnd,
    });
    edges.push({
      type: "HAS_ENTITY",
      from: documentNodeId(input.documentId),
      to: entityNodeId(entity.id),
    });

    for (const clause of input.clauses) {
      if (entityWithinClause(entity, clause)) {
        edges.push({
          type: "REFERENCES",
          from: clauseNodeId(clause.id),
          to: entityNodeId(entity.id),
        });
      }
    }
  }

  for (const risk of input.risks) {
    nodes.push({
      id: riskNodeId(risk.id),
      type: "RISK_FINDING",
      label: risk.category,
      text: null,
      textStart: null,
      textEnd: null,
    });

    const comparedClauseNodeIds: string[] = [];
    for (const ev of risk.evidence) {
      const targetId = ev.sourceTable === "document_clauses" ? ev.sourceId : ev.sourceId;
      const targetNodeId =
        ev.sourceTable === "document_clauses" ? clauseNodeId(targetId) : entityNodeId(targetId);
      const targetExists =
        ev.sourceTable === "document_clauses" ? clauseIds.has(targetId) : entityIds.has(targetId);
      if (!targetExists) continue;

      edges.push({ type: "FLAGS", from: riskNodeId(risk.id), to: targetNodeId });
      if (ev.sourceTable === "document_clauses") {
        comparedClauseNodeIds.push(targetNodeId);
      }
    }

    // COMPARED_WITH: every pair of clause-sourced evidence spans on the
    // same Pass 2 finding (Pass 1 findings only ever cite one clause, so
    // this loop never adds an edge for them - there's no second clause to
    // pair with).
    for (let i = 0; i < comparedClauseNodeIds.length; i++) {
      for (let j = i + 1; j < comparedClauseNodeIds.length; j++) {
        const a = comparedClauseNodeIds[i];
        const b = comparedClauseNodeIds[j];
        if (!a || !b) continue;
        edges.push({ type: "COMPARED_WITH", from: a, to: b });
      }
    }
  }

  return {
    documentId: input.documentId,
    modelSource: input.modelSource,
    nodes,
    edges,
  };
}
