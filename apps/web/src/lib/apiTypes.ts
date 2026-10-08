// Types mirroring the API's actual JSON response shapes exactly (Prisma's
// @map converts DB snake_case to JS camelCase, and every route passes
// those objects through directly or composes them additively - see
// apps/api/src/routes/documents.ts). No field here is invented; anything
// not present on a real response is typed as optional/nullable, never
// assumed.

// A plain string, not a two-value union: the backend's set of valid
// document types is a DomainPack registry, not a fixed pair (Phase 8 Step
// 2, docs/phase8/step2_migration_notes.md) - a TypeScript union here was
// never a real runtime guarantee against the API returning a third value
// anyway, only a compile-time assumption that happened to match today's
// two domains.
export type DocumentType = string;
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

// Phase 8 extends the category set (generic fact checks + consistency
// engine); the union lists every value the API currently emits.
export type RiskCategory =
  | "LIABILITY_SHIFT"
  | "ASYMMETRIC_OBLIGATION"
  | "UNBOUNDED_DISCRETION"
  | "LAND_USE_CONTRADICTION"
  | "MISSING_CLAUSE"
  | "ONE_SIDED_REMEDY"
  | "RESTRICTIVE_COVENANT"
  | "UNCAPPED_LIABILITY"
  | "FINANCIAL_CONTRADICTION"
  | "DATE_CONTRADICTION"
  | "DURATION_CONTRADICTION"
  | "PROPERTY_AREA_CONTRADICTION"
  | "PROPERTY_IDENTIFIER_CONTRADICTION"
  | "PAYMENT_TOTAL_MISMATCH"
  | "PARTY_ROLE_INCONSISTENCY"
  | "PARTY_NAME_CONTRADICTION"
  | "DEFINITION_INCONSISTENCY";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskPass = "PASS_1" | "PASS_2" | "CONSISTENCY";

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
  /** Phase 8: which consistency/fact rule produced the finding. */
  ruleId?: string | null;
  reviewRequired?: boolean;
}

export type GraphNodeType =
  "DOCUMENT" | "ENTITY" | "CLAUSE" | "RISK_FINDING" | "OBLIGATION" | "EVENT" | "LEGAL_REFERENCE";
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

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
  category?: string;
}

export interface GraphEdge {
  type: GraphEdgeType;
  from: string;
  to: string;
  label?: string;
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
  clauseId?: string | null;
  clauseType?: string | null;
  clauseNumber?: string | null;
  page?: number | null;
}

export type EvidenceStatus = "GROUNDED" | "NOT_SUFFICIENT";

export interface AskResult {
  answer: string;
  grounded: boolean;
  sources: AskSource[];
  /** Phase 8 - absent on responses from older API builds. */
  evidenceStatus?: EvidenceStatus;
  method?: "structured" | "retrieval";
}

export interface ApiErrorBody {
  error?: unknown;
}

// GET /domain-packs (Phase 8) - serializable view of the API's DomainPack
// registry. Upload slugs, display names and ontology come from here rather
// than being hardcoded in the web app.
export interface DomainPackDocumentType {
  /** DB DocumentType enum value, e.g. "LAND_LEASE". */
  id: string;
  /** Upload value, e.g. "land_lease". */
  slug: string;
  label: string;
}

export interface DomainPackEntityType {
  label: string;
  displayName: string;
  coreType: string;
}

export interface DomainPackSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  documentTypes: DomainPackDocumentType[];
  entityTypes: DomainPackEntityType[];
  clauseTypes: string[];
  expectedClauseTypes: string[];
}

// --- Phase 8 semantic layer (apps/api/src/routes/semantics.ts) -------------

export interface DomainCandidate {
  domain: string;
  documentType: string;
  score: number;
  supportingSignals: string[];
}

// Deterministic signal counts - deliberately no probability/confidence.
export interface DomainDetection {
  predictedDomain: string | null;
  predictedDocumentType: string | null;
  candidateDomains: DomainCandidate[];
  supportingSignals: string[];
  method: string;
  declaredDomain?: string;
  declaredDocumentType?: string;
  agreesWithDeclared?: boolean;
}

export interface OverviewField {
  label: string;
  displayName: string;
  coreType: string;
  value: string | null;
  values: string[];
  normalized: Record<string, unknown> | null;
  evidence: { entityId: string; textStart: number; textEnd: number } | null;
}

export interface DocumentOverview {
  domain: string;
  domainName: string;
  documentType: string;
  fields: OverviewField[];
  detection: DomainDetection | null;
}

export interface Obligation {
  actorLabel: string;
  actorEntityId: string | null;
  actorText: string;
  action: string;
  unexpectedActor: boolean;
  amountEntityId: string | null;
  amountLabel: string | null;
  amountInr: number | null;
  deadlineIso: string | null;
  deadlineText: string | null;
  frequency: "MONTHLY" | "ANNUAL" | null;
  condition: string | null;
  sourceClauseId: string | null;
  textStart: number;
  textEnd: number;
  evidenceText: string;
}

// GET /compare?a=&b= (apps/api/src/semantic/compare.ts)
export type DiffStatus = "SAME" | "CHANGED" | "ADDED" | "REMOVED";

export interface CompareSideValue {
  text: string;
  normalized: Record<string, unknown> | null;
  textStart: number;
  textEnd: number;
}

export interface DocumentComparison {
  a: { documentId: string; documentType: string; domain: string };
  b: { documentId: string; documentType: string; domain: string };
  sameDomain: boolean;
  fields: {
    label: string;
    displayName: string;
    coreType: string;
    status: DiffStatus;
    a: CompareSideValue[];
    b: CompareSideValue[];
  }[];
  clauses: {
    clauseType: string;
    status: DiffStatus;
    a: { clauseNumber: string | null } | null;
    b: { clauseNumber: string | null } | null;
  }[];
  obligations: {
    actorLabel: string;
    action: string;
    status: DiffStatus;
    a: { amountInr: number | null; deadlineText: string | null; evidenceText: string } | null;
    b: { amountInr: number | null; deadlineText: string | null; evidenceText: string } | null;
  }[];
  relations: {
    relationType: string;
    subjectLabel: string;
    objectLabel: string;
    status: DiffStatus;
    a: string[];
    b: string[];
  }[];
  risks: {
    category: string;
    status: DiffStatus;
    a: { severity: string; reason: string } | null;
    b: { severity: string; reason: string } | null;
  }[];
  summary: Record<DiffStatus, number>;
}
