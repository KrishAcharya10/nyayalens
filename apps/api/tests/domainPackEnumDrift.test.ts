import { DocumentType } from "@nyayalens/db";
import { describe, expect, it } from "vitest";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { CORE_ENTITY_TYPES } from "../src/domains/registry.js";

// The safety net recommended in docs/phase8/step2_enum_decision.md: the
// DocumentType Postgres enum and the DomainPack registry must agree in
// BOTH directions, so "added a pack but forgot the enum migration" (or the
// reverse) fails here instead of at the first upload.
describe("DomainPack registry <-> DB DocumentType enum drift", () => {
  const registry = getDomainPackRegistry();
  const registered = registry.list().flatMap((p) => p.documentTypes);
  const enumValues = Object.values(DocumentType) as string[];

  it("every registered document type is a DocumentType enum value", () => {
    for (const dt of registered) {
      expect(enumValues, `pack document type ${dt.id}`).toContain(dt.id);
    }
  });

  it("every DocumentType enum value is owned by exactly one pack", () => {
    for (const value of enumValues) {
      expect(
        registered.filter((dt) => dt.id === value),
        `enum value ${value}`,
      ).toHaveLength(1);
      expect(registry.forDocumentType(value).documentTypes.map((dt) => dt.id)).toContain(value);
    }
  });

  it("upload slugs are the lowercase form of the enum value (the schema's @map)", () => {
    for (const dt of registered) {
      expect(dt.slug).toBe(dt.id.toLowerCase());
    }
  });
});

describe("DomainPack ontology integrity", () => {
  const packs = getDomainPackRegistry().list();

  it("every entity label maps to a known core type and is unique within its pack", () => {
    for (const pack of packs) {
      const labels = pack.entitySchema.map((e) => e.label);
      expect(new Set(labels).size, pack.id).toBe(labels.length);
      for (const e of pack.entitySchema) {
        expect(CORE_ENTITY_TYPES, `${pack.id}.${e.label}`).toContain(e.coreType);
      }
    }
  });

  it("every relation endpoint is DOCUMENT or one of the pack's own entity labels", () => {
    for (const pack of packs) {
      const labels = new Set(["DOCUMENT", ...pack.entitySchema.map((e) => e.label)]);
      for (const r of pack.relationSchema) {
        expect(labels.has(r.subjectEntityLabel), `${pack.id} ${r.relationType} subject`).toBe(true);
        expect(labels.has(r.objectEntityLabel), `${pack.id} ${r.relationType} object`).toBe(true);
      }
    }
  });

  it("every obligation actor and expected clause type is defined by the pack", () => {
    for (const pack of packs) {
      const labels = new Set(pack.entitySchema.map((e) => e.label));
      const clauseTypes = new Set(pack.clauseSchema.map((c) => c.clauseType));
      for (const o of pack.obligationSchema) {
        for (const actor of o.actorLabels)
          expect(labels.has(actor), `${pack.id} ${o.action}`).toBe(true);
      }
      for (const ct of pack.riskSchema.expectedClauseTypes) {
        expect(clauseTypes.has(ct), `${pack.id} expects ${ct}`).toBe(true);
      }
    }
  });

  it("clause priorities are unique within a pack (match order must be unambiguous)", () => {
    for (const pack of packs) {
      const priorities = pack.clauseSchema.map((c) => c.priority);
      expect(new Set(priorities).size, pack.id).toBe(priorities.length);
    }
  });

  it("legal references never claim official verification without a source URL", () => {
    for (const pack of packs) {
      for (const ref of pack.legalFrameworks) {
        if (ref.verification === "VERIFIED_OFFICIAL_TEXT") {
          expect(ref.sourceUrl, `${pack.id} ${ref.id}`).toBeTruthy();
        }
      }
    }
  });
});
