import { Router } from "express";
import { getDomainPackRegistry } from "../domains/index.js";
import type { DomainPack } from "../domains/registry.js";
import { requireAuth } from "../middleware/auth.js";

// Read-only, serializable view of the DomainPack registry for clients
// (the upload form's document-type list, domain-specific labels in the
// workspace). Heading/detection regexes and risk-check functions are
// implementation details and are not exposed. No document data is
// involved, but the route still requires auth like the rest of the API.
export const domainPacksRouter = Router();

function toPublic(pack: DomainPack<unknown, unknown>) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    documentTypes: pack.documentTypes,
    entityTypes: pack.entitySchema,
    clauseTypes: [...pack.clauseSchema]
      .sort((a, b) => a.priority - b.priority)
      .map((c) => c.clauseType),
    expectedClauseTypes: pack.riskSchema.expectedClauseTypes,
    relationTypes: pack.relationSchema,
    obligationTypes: pack.obligationSchema,
    consistencyRules: pack.consistencyRules,
    legalReferences: pack.legalFrameworks,
  };
}

domainPacksRouter.get("/", requireAuth, (_req, res) => {
  res.status(200).json({ domainPacks: getDomainPackRegistry().list().map(toPublic) });
});
