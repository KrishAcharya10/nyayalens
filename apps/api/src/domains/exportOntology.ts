// Serializes every registered DomainPack's ontology to plain JSON for the
// Python side (research/generator/v3/ and its dataset validator), so the
// TypeScript packs stay the single source of truth for labels, clause
// types, relations, obligations and consistency rules.
//
// Written by `npm run export:ontology --workspace=apps/api` to
// research/generator/v3/ontology.json; tests/ontologyExport.test.ts fails
// if that committed file is stale.
import { getDomainPackRegistry } from "./index.js";

export function exportOntology() {
  return {
    generatedFrom: "apps/api/src/domains (DomainPack registry)",
    domains: getDomainPackRegistry()
      .list()
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        documentTypes: pack.documentTypes.map((dt) => ({ id: dt.id, slug: dt.slug })),
        entities: pack.entitySchema.map((e) => ({ label: e.label, coreType: e.coreType })),
        partyTerms: pack.partyTerms,
        clauseTypes: [
          ...new Set(
            [...pack.clauseSchema].sort((a, b) => a.priority - b.priority).map((c) => c.clauseType),
          ),
        ],
        relations: pack.relationSchema.map((r) => ({
          type: r.relationType,
          subject: r.subjectEntityLabel,
          object: r.objectEntityLabel,
        })),
        obligations: pack.obligationSchema.map((o) => ({
          action: o.action,
          actors: o.actorLabels,
        })),
        consistencyRules: pack.consistencyRules,
        expectedClauseTypes: pack.riskSchema.expectedClauseTypes,
        expectedByDocumentType: Object.fromEntries(
          pack.documentTypes.map((dt) => [
            dt.id,
            pack.riskSchema.expectedClauseTypesByDocumentType?.[dt.id] ??
              pack.riskSchema.expectedClauseTypes,
          ]),
        ),
      })),
  };
}

export function exportOntologyJson(): string {
  return `${JSON.stringify(exportOntology(), null, 2)}\n`;
}
