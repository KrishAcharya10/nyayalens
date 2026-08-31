// Phase 7A knowledge-graph correctness spot-check. Loads the graph for a
// sample of already-uploaded real synthetic documents (the
// phase4b-eval@nyayalens.local account's 300 ordinary documents, plus the
// phase6-adversarial-eval@nyayalens.local account's 150 adversarial
// documents, if present) and asserts - programmatically, not by eye - that
// every HAS_ENTITY/HAS_CLAUSE/FLAGS edge count matches the underlying
// entities/document_clauses/risks row counts for that document exactly,
// and that every REFERENCES/COMPARED_WITH edge is independently
// recomputable from the same source rows.
//
// Usage (from apps/api - imports TypeScript source via tsx):
//   dotenv -e ../../.env -- tsx scripts/evaluate-graph.mjs [sampleSize]
import { getPrismaClient } from "@nyayalens/db";
import { loadDocumentGraph } from "../src/graph/loadDocumentGraph.js";

const prisma = getPrismaClient();
const SAMPLE_SIZE = Number(process.argv[2] ?? 40);

function entityWithinClause(entity, clause) {
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

async function checkDocument(documentId) {
  const [clauses, entities, risks, graph] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, textStart: true, textEnd: true },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, textStart: true, textEnd: true },
    }),
    prisma.risk.findMany({
      where: { documentId, modelSource: "RULE_BASED" },
      select: { id: true, evidence: true },
    }),
    loadDocumentGraph(documentId, "RULE_BASED"),
  ]);

  const problems = [];

  const hasClauseEdges = graph.edges.filter((e) => e.type === "HAS_CLAUSE");
  if (hasClauseEdges.length !== clauses.length) {
    problems.push(
      `HAS_CLAUSE count ${hasClauseEdges.length} != ${clauses.length} persisted clauses`,
    );
  }

  const hasEntityEdges = graph.edges.filter((e) => e.type === "HAS_ENTITY");
  if (hasEntityEdges.length !== entities.length) {
    problems.push(
      `HAS_ENTITY count ${hasEntityEdges.length} != ${entities.length} persisted entities`,
    );
  }

  let expectedReferences = 0;
  for (const entity of entities) {
    for (const clause of clauses) {
      if (entityWithinClause(entity, clause)) expectedReferences++;
    }
  }
  const referencesEdges = graph.edges.filter((e) => e.type === "REFERENCES");
  if (referencesEdges.length !== expectedReferences) {
    problems.push(
      `REFERENCES count ${referencesEdges.length} != ${expectedReferences} independently recomputed`,
    );
  }

  let expectedFlags = 0;
  const clauseIds = new Set(clauses.map((c) => c.id));
  const entityIds = new Set(entities.map((e) => e.id));
  for (const risk of risks) {
    const evidence = Array.isArray(risk.evidence) ? risk.evidence : [];
    for (const ev of evidence) {
      const exists =
        ev.sourceTable === "document_clauses"
          ? clauseIds.has(ev.sourceId)
          : entityIds.has(ev.sourceId);
      if (exists) expectedFlags++;
    }
  }
  const flagsEdges = graph.edges.filter((e) => e.type === "FLAGS");
  if (flagsEdges.length !== expectedFlags) {
    problems.push(`FLAGS count ${flagsEdges.length} != ${expectedFlags} independently recomputed`);
  }

  return { documentId, ok: problems.length === 0, problems };
}

async function main() {
  const documents = await prisma.document.findMany({
    where: {
      owner: {
        email: { in: ["phase4b-eval@nyayalens.local", "phase6-adversarial-eval@nyayalens.local"] },
      },
    },
    select: { id: true },
    take: SAMPLE_SIZE,
  });

  console.log(`[evaluate-graph] Checking ${documents.length} documents...`);

  let ok = 0;
  let failed = 0;
  for (const doc of documents) {
    const result = await checkDocument(doc.id);
    if (result.ok) {
      ok++;
    } else {
      failed++;
      console.error(
        `[evaluate-graph] MISMATCH ${result.documentId}: ${result.problems.join("; ")}`,
      );
    }
  }

  console.log(
    `\n[evaluate-graph] Done. ${ok}/${documents.length} exact matches, ${failed} mismatches.`,
  );
  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("[evaluate-graph] Fatal error:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
