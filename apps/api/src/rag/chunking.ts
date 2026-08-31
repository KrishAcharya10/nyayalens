// Chunking strategy (Phase 7A + addendum): one chunk per persisted
// DocumentClause row, reusing Phase 4A's existing clause segmentation
// rather than inventing a new scheme - clause boundaries are already
// deterministic and meaningful (see docs/architecture/rag_design.md).
//
// Addendum: clause segmentation only ever spans from the first numbered
// heading onward (clauseSegmenter.ts), so preamble text - party names,
// property/land address, survey number, land area, land classification -
// is never part of any clause and so never became a chunk under the
// original Phase 7A scheme, even though that text IS present in
// canonical_text (Phase 3). Investigation for this addendum confirmed
// those exact facts already exist as real, correctly-offset RULE_BASED
// Entity rows: rulePatterns.ts's LANDLORD/TENANT/LESSOR/LESSEE/ADDRESS/
// SURVEY_NUMBER/LAND_AREA/LAND_USE_TYPE patterns run over the ENTIRE
// canonical_text, independent of clause boundaries - so the fix is to
// synthesize a small chunk per preamble entity from data that already
// exists, not to re-parse raw text or invent a new extraction step.
import type { Chunk } from "./types.js";

export interface ChunkableClause {
  id: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

export interface ChunkableEntity {
  id: string;
  label: string;
  text: string | null;
  textStart: number | null;
  textEnd: number | null;
}

// Deterministic: same clause rows in any input order always produce the
// same chunk list, sorted by document position - see chunking.test.ts.
export function buildChunksFromClauses(documentId: string, clauses: ChunkableClause[]): Chunk[] {
  return clauses
    .filter((c): c is ChunkableClause & { text: string } => c.text !== null && c.text.length > 0)
    .map((c) => ({
      chunkId: c.id,
      documentId,
      chunkType: "clause" as const,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
    }))
    .sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));
}

// A human-readable label for a synthesized entity chunk's text
// ("Landlord: Peter Majumdar" reads far better than just "Peter
// Majumdar" for BM25 to match a question like "who is the landlord").
// Falls back to a humanized version of the raw label for anything not
// explicitly listed (e.g. the untested KHATA_NUMBER/EASEMENT_RIGHT
// extensions - see extraction_pipeline.md), so this never silently drops
// an entity type it doesn't recognize.
const ENTITY_DISPLAY_NAME: Record<string, string> = {
  LANDLORD: "Landlord",
  TENANT: "Tenant",
  LESSOR: "Lessor",
  LESSEE: "Lessee",
  ADDRESS: "Property address",
  SURVEY_NUMBER: "Survey number",
  LAND_AREA: "Land area",
  LAND_USE_TYPE: "Land use classification",
};

function humanizeLabel(label: string): string {
  return (
    ENTITY_DISPLAY_NAME[label] ??
    label
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}

// A clause "contains" an entity when the entity's span falls entirely
// within the clause's span - the same co-location rule
// apps/api/src/graph/buildGraph.ts uses for REFERENCES edges, deliberately
// reimplemented locally (not imported) so apps/api/src/rag/ stays
// self-contained and this addendum never has to touch the knowledge
// graph module.
function entityWithinAnyClause(entity: ChunkableEntity, clauses: ChunkableClause[]): boolean {
  if (entity.textStart === null || entity.textEnd === null) return false;
  return clauses.some(
    (clause) =>
      clause.textStart !== null &&
      clause.textEnd !== null &&
      entity.textStart! >= clause.textStart &&
      entity.textEnd! <= clause.textEnd,
  );
}

// Only entities NOT already covered by a clause chunk become their own
// chunk - an entity inside a clause (e.g. RENT inside the RENT_PAYMENT
// clause) is already retrievable via that clause's chunk text, so a
// separate entity chunk for it would duplicate content, not add
// coverage. In practice this naturally selects exactly the preamble-only
// entities (party names, address, survey number, land area, land use
// type) without needing a hardcoded label allowlist, since every other
// entity type this generator produces (RENT, SECURITY_DEPOSIT, DURATION,
// NOTICE_PERIOD, LEASE_PREMIUM) is always inside its clause.
export function buildChunksFromEntities(
  documentId: string,
  entities: ChunkableEntity[],
  clauses: ChunkableClause[],
): Chunk[] {
  return entities
    .filter((e): e is ChunkableEntity & { text: string } => e.text !== null && e.text.length > 0)
    .filter((e) => !entityWithinAnyClause(e, clauses))
    .map((e) => ({
      chunkId: e.id,
      documentId,
      chunkType: "entity" as const,
      text: `${humanizeLabel(e.label)}: ${e.text}`,
      // Genuine provenance - the entity's own real offsets into
      // canonical_text, never fabricated. The synthesized display text
      // above is not itself literally at these offsets (it's a
      // human-readable label + the entity's real text), but the offsets
      // still point at the real span the fact was extracted from, the
      // same guarantee every other chunk/citation in this system makes.
      textStart: e.textStart,
      textEnd: e.textEnd,
    }))
    .sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));
}

// The single entry point runAsk.ts and the evaluation scripts use -
// combines both chunk sources, sorted by document position. Deterministic
// for the same reason each half is: no randomness, no unordered Set/Map
// iteration exposed, stable sort.
export function buildChunks(
  documentId: string,
  clauses: ChunkableClause[],
  entities: ChunkableEntity[],
): Chunk[] {
  return [
    ...buildChunksFromClauses(documentId, clauses),
    ...buildChunksFromEntities(documentId, entities, clauses),
  ].sort((a, b) => (a.textStart ?? 0) - (b.textStart ?? 0));
}
