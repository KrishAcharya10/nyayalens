// Types mirroring the API's actual JSON response shapes exactly (Prisma's
// @map converts DB snake_case to JS camelCase, and every route passes
// those objects through directly or composes them additively - see
// apps/api/src/routes/documents.ts). No field here is invented; anything
// not present on a real response is typed as optional/nullable, never
// assumed.

export type DocumentType = "RESIDENTIAL_RENTAL" | "LAND_LEASE";
export type ModelSource = "RULE_BASED" | "GENERIC_TRANSFORMER" | "FINE_TUNED";
export type ProcessingJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ProcessingSummaryStatus = "NOT_STARTED" | "PROCESSING" | "READY" | "FAILED";

export interface DocumentSummary {
  id: string;
  title: string;
  documentType: DocumentType;
  isSynthetic: boolean;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  processingStatus: ProcessingSummaryStatus;
}

export interface ProcessingJob {
  id: string;
  documentId: string;
  jobType: string;
  status: ProcessingJobStatus;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  text: string | null;
  extractionMethod: "NATIVE" | "OCR" | null;
  ocrConfidence: number | null;
  createdAt: string;
}

export interface DocumentDetail {
  id: string;
  ownerId: string;
  title: string;
  documentType: DocumentType;
  isSynthetic: boolean;
  isAdversarial: boolean;
  isAdversarialControl: boolean;
  sourceFilename: string | null;
  storageKey: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  canonicalText: string | null;
  keyFindings: KeyFindings | null;
  createdAt: string;
  updatedAt: string;
  pages: DocumentPage[];
  processingJobs: ProcessingJob[];
}

export interface KeyFindings {
  summary?: string;
  critical_terms?: {
    label: string;
    value: string;
    evidence?: { text_start: number; text_end: number };
  }[];
  flagged_risks?: { severity: string; category: string; reason: string }[];
  missing_clauses?: string[];
  requires_review?: boolean;
}

export interface Entity {
  id: string;
  documentId: string;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
  pageNumber: number | null;
  bboxX: number | null;
  bboxY: number | null;
  bboxWidth: number | null;
  bboxHeight: number | null;
  modelSource: ModelSource;
  confidence: number | null;
  modelName: string | null;
  modelVersion: string | null;
  createdAt: string;
}

export interface DocumentClause {
  id: string;
  documentId: string;
  clauseType: string;
  clauseNumber: string | null;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
  pageNumber: number | null;
  modelSource: ModelSource;
  confidence: number | null;
  createdAt: string;
}

export type RiskCategory =
  | "LIABILITY_SHIFT"
  | "ASYMMETRIC_OBLIGATION"
  | "UNBOUNDED_DISCRETION"
  | "LAND_USE_CONTRADICTION"
  | "MISSING_CLAUSE";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskPass = "PASS_1" | "PASS_2";

export interface RiskEvidenceSpan {
  sourceTable: "document_clauses" | "entities";
  sourceId: string;
  documentId: string;
  textStart: number | null;
  textEnd: number | null;
  text: string | null;
}

export interface Risk {
  id: string;
  documentId: string;
  category: RiskCategory;
  severity: RiskSeverity;
  reason: string;
  pass: RiskPass;
  modelSource: ModelSource;
  evidence: RiskEvidenceSpan[];
  textStart: number | null;
  textEnd: number | null;
  createdAt: string;
}

export type GraphNodeType = "DOCUMENT" | "ENTITY" | "CLAUSE" | "RISK_FINDING";
export type GraphEdgeType = "HAS_ENTITY" | "HAS_CLAUSE" | "REFERENCES" | "FLAGS" | "COMPARED_WITH";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

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

export type ChunkType = "clause" | "entity";

export interface AskSource {
  chunkId: string;
  documentId: string;
  chunkType: ChunkType;
  textStart: number | null;
  textEnd: number | null;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  grounded: boolean;
  sources: AskSource[];
}

export interface ApiErrorBody {
  error?: unknown;
}
