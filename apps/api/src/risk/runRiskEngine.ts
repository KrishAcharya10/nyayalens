import { getPrismaClient, type ModelSource, type Prisma } from "@nyayalens/db";
import { getDomainPackRegistry } from "../domains/index.js";
import { analyzeText } from "../semantic/analyze.js";
import { pageSpans } from "../semantic/facts.js";
import type { RiskFinding } from "./types.js";

const prisma = getPrismaClient();

// model_source is an explicit, visible parameter - never an implicit
// assumption. Defaults to RULE_BASED because it's the only currently
// reliable entity/clause source (generic_transformer's own labels never
// match the domain ontology at all; fine_tuned currently produces zero
// entities - see docs/architecture/evaluation_results.md) - but nothing
// here hardcodes that a document only ever has rule_based data, and a
// future working fine_tuned model is a drop-in swap via this parameter.
//
// Phase 8: findings now come from semantic/analyze.ts - Pass 1, Pass 2 and
// the consistency engine (pass CONSISTENCY) - the same function the
// offline evaluation harness runs. Pass 1/Pass 2 behaviour for rental and
// land lease is unchanged apart from the generic checks those packs now
// also register (docs/domain_packs.md).
export async function runRiskEngine(
  documentId: string,
  modelSource: ModelSource = "RULE_BASED",
): Promise<RiskFinding[]> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { documentType: true, canonicalText: true },
  });

  const [clauses, entities, pages] = await Promise.all([
    prisma.documentClause.findMany({
      where: { documentId, modelSource },
      select: {
        id: true,
        clauseType: true,
        clauseNumber: true,
        text: true,
        textStart: true,
        textEnd: true,
      },
    }),
    prisma.entity.findMany({
      where: { documentId, modelSource },
      select: { id: true, label: true, text: true, textStart: true, textEnd: true },
    }),
    prisma.documentPage.findMany({
      where: { documentId },
      select: { pageNumber: true, text: true },
    }),
  ]);

  // Resolve this document's pack once, explicitly - the real pipeline
  // never relies on runPass1/runPass2's own registry-lookup default
  // parameters (those exist only so each remains independently callable
  // with a single argument, for their own unit tests). See
  // docs/phase8/step2_migration_notes.md.
  const pack = getDomainPackRegistry().forDocumentType(document.documentType);
  const { findings } = analyzeText({
    documentId,
    documentType: document.documentType,
    pack,
    text: document.canonicalText ?? "",
    pages: pageSpans(pages),
    entities: entities
      .filter((e) => e.text !== null && e.textStart !== null && e.textEnd !== null)
      .map((e) => ({ ...e, text: e.text!, textStart: e.textStart!, textEnd: e.textEnd! })),
    clauses: clauses
      .filter((c) => c.textStart !== null && c.textEnd !== null)
      .map((c) => ({ ...c, textStart: c.textStart!, textEnd: c.textEnd! })),
  });

  await prisma.risk.deleteMany({ where: { documentId, modelSource } });
  if (findings.length > 0) {
    await prisma.risk.createMany({
      data: findings.map((f) => ({
        documentId,
        category: f.category,
        severity: f.severity,
        reason: f.reason,
        pass: f.pass,
        ruleId: f.ruleId ?? null,
        reviewRequired: f.reviewRequired ?? true,
        modelSource,
        evidence: f.evidence as unknown as Prisma.InputJsonValue,
        // First evidence span duplicated for simple filtering - see
        // schema.prisma's Risk model comment. Missing-clause findings
        // (category 5) have no evidence spans at all (document-level).
        textStart: f.evidence[0]?.textStart ?? null,
        textEnd: f.evidence[0]?.textEnd ?? null,
      })),
    });
  }

  return findings;
}
