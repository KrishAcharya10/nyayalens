// Re-runs rule-based NER (apps/api/src/ner/rulePatterns.ts) against every
// already-uploaded evaluation document's stored canonical_text and
// overwrites its RULE_BASED entities in place. Exists because a bug fix
// to the extractor (see rulePatterns.ts's LESSEE pattern comment) needs
// to be reflected in already-persisted Phase 4B evaluation data without
// re-running the whole upload+extraction pipeline (canonical_text itself
// didn't change, only what the NER pattern registry finds in it).
//
// Usage (run from apps/api - imports TypeScript source, so needs tsx,
// not plain node): dotenv -e ../../.env -- tsx scripts/backfill-rule-based-ner.mjs

import { getPrismaClient } from "@nyayalens/db";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";

const prisma = getPrismaClient();

async function main() {
  const documents = await prisma.document.findMany({
    where: {
      canonicalText: { not: null },
      owner: { email: "phase4b-eval@nyayalens.local" },
    },
    select: { id: true, canonicalText: true, documentType: true },
  });

  console.log(`[backfill-rule-based] ${documents.length} documents found`);

  let totalEntities = 0;
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    // Same document-scoping as the live pipeline (jobs/pipeline.ts).
    const pack = getDomainPackRegistry().forDocumentType(doc.documentType);
    const entities = runRuleBasedNer(doc.canonicalText ?? "", {
      allowedLabels: new Set(pack.entitySchema.map((e) => e.label)),
    });

    await prisma.entity.deleteMany({ where: { documentId: doc.id, modelSource: "RULE_BASED" } });
    if (entities.length > 0) {
      await prisma.entity.createMany({
        data: entities.map((e) => ({
          documentId: doc.id,
          label: e.label,
          text: e.text,
          textStart: e.textStart,
          textEnd: e.textEnd,
          confidence: e.confidence,
          modelName: e.modelName,
          modelSource: "RULE_BASED",
        })),
      });
    }
    totalEntities += entities.length;

    if ((i + 1) % 50 === 0 || i === documents.length - 1) {
      console.log(`[backfill-rule-based] ${i + 1}/${documents.length} documents re-processed`);
    }
  }

  console.log(
    `[backfill-rule-based] Done. ${totalEntities} entities written across ${documents.length} documents.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-rule-based] Fatal error:", err);
  process.exitCode = 1;
});
