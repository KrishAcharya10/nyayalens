import { getPrismaClient, type ModelSource, type Prisma } from "@nyayalens/db";
import { runPass1 } from "./pass1PerClause.js";
import { runPass2 } from "./pass2CrossClause.js";
import type { RiskEngineContext, RiskFinding } from "./types.js";

const prisma = getPrismaClient();

// model_source is an explicit, visible parameter - never an implicit
// assumption. Defaults to RULE_BASED because it's the only currently
// reliable entity/clause source (generic_transformer's own labels never
// match the domain ontology at all; fine_tuned currently produces zero
// entities - see docs/architecture/evaluation_results.md) - but nothing
// here hardcodes that a document only ever has rule_based data, and a
// future working fine_tuned model is a drop-in swap via this parameter.
export async function runRiskEngine(
  documentId: string,
  modelSource: ModelSource = "RULE_BASED",
): Promise<RiskFinding[]> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { documentType: true },
  });

  const [clauses, entities] = await Promise.all([
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
  ]);

  const context: RiskEngineContext = {
    documentId,
    documentType: document.documentType,
    clauses,
    entities,
  };

  const findings = [...runPass1(context), ...runPass2(context)];

  await prisma.risk.deleteMany({ where: { documentId, modelSource } });
  if (findings.length > 0) {
    await prisma.risk.createMany({
      data: findings.map((f) => ({
        documentId,
        category: f.category,
        severity: f.severity,
        reason: f.reason,
        pass: f.pass,
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
