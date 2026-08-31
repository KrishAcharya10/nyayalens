// RAG core types (Phase 7A). RetrievalProvider and LLMProvider are the
// two swap points the build prompt requires - see rag_design.md for which
// implementation of each is the default and why.

export interface Chunk {
  // Equal to the source DocumentClause's id - one chunk per clause (see
  // chunking.ts for why reusing clause segmentation, not a new scheme).
  chunkId: string;
  documentId: string;
  text: string;
  textStart: number | null;
  textEnd: number | null;
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export interface RetrievalProvider {
  name: string;
  retrieve(query: string, chunks: Chunk[], k: number): ScoredChunk[];
}

// One evidence item handed to an LLMProvider - always a real, persisted
// chunk with real offsets, never fabricated. This is also exactly the
// shape /ask returns as `sources`.
export interface EvidenceItem {
  chunkId: string;
  documentId: string;
  textStart: number | null;
  textEnd: number | null;
  text: string;
}

// The three explicitly separated channels - see rag_design.md's
// prompt-injection defense section. `systemInstructions` is fixed,
// authored by this codebase, never influenced by document content.
// `question` is the user's own input. `evidence` is retrieved document
// text, always treated as data by every LLMProvider implementation, never
// as instructions.
export interface LLMRequest {
  systemInstructions: string;
  question: string;
  evidence: EvidenceItem[];
}

export interface LLMAnswer {
  answer: string;
  grounded: boolean;
  // Which evidence items (by chunkId) the answer actually cites. Omitted =
  // the caller treats every evidence item passed in the request as cited
  // (a safe default for a provider that doesn't track this itself).
  citedChunkIds?: string[];
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMAnswer>;
}
