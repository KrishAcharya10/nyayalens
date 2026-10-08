// Inputs to the semantic layer - the persisted Entity / DocumentClause rows
// it is computed from (only the fields it needs).
export interface SemanticEntity {
  id: string;
  label: string;
  text: string;
  textStart: number;
  textEnd: number;
  modelSource?: string;
}

export interface SemanticClause {
  id: string;
  clauseType: string;
  clauseNumber: string | null;
  textStart: number;
  textEnd: number;
}

export interface PageSpan {
  pageNumber: number;
  /** Offsets of this page's text within the document's canonicalText. */
  textStart: number;
  textEnd: number;
}
