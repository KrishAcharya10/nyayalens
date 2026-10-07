import { describe, expect, it } from "vitest";
import {
  DuplicateDocumentTypeError,
  DuplicatePackError,
  PackNotFoundError,
  createRegistry,
  type DomainPack,
} from "../src/domains/registry.js";

// Minimal fixture packs - deliberately not a real rental/land-lease
// ontology (that worked mapping lives in docs/phase8/domainpack_design.md
// as a paper exercise only). These tests exercise registry mechanics
// only: register, retrieve, duplicate-id detection, missing-pack error.
// Each fixture owns a document type derived from its id, since the
// registry rejects two packs claiming the same document type.
function makeFixturePack(overrides: Partial<DomainPack> = {}): DomainPack {
  const id = overrides.id ?? "fixture_domain";
  return {
    id,
    name: "Fixture Domain",
    description: "Registry-mechanics fixture.",
    version: "0.0.1",
    jurisdiction: { country: "IN", referenceVersion: "2026-09" },
    documentTypes: [{ id: id.toUpperCase(), slug: id, label: "Fixture" }],
    entitySchema: [],
    clauseSchema: [],
    relationSchema: [],
    obligationSchema: [],
    riskSchema: {
      expectedClauseTypes: [],
      missingClauseSeverity: {},
      perClauseChecks: [],
      comparisonChecks: [],
    },
    consistencyRules: [],
    detection: { titlePatterns: [], lexicalPatterns: [] },
    legalFrameworks: [],
    ...overrides,
  };
}

describe("DomainPackRegistry", () => {
  it("registers a pack and retrieves it by id", () => {
    const registry = createRegistry();
    const pack = makeFixturePack();

    registry.register(pack);

    expect(registry.get("fixture_domain")).toBe(pack);
  });

  it("list() reflects every registered pack", () => {
    const registry = createRegistry();
    const packA = makeFixturePack({ id: "domain_a" });
    const packB = makeFixturePack({ id: "domain_b" });

    registry.register(packA);
    registry.register(packB);

    expect(registry.list()).toHaveLength(2);
    expect(registry.list()).toEqual(expect.arrayContaining([packA, packB]));
  });

  it("list() is empty for a freshly created registry", () => {
    const registry = createRegistry();
    expect(registry.list()).toEqual([]);
  });

  it("throws DuplicatePackError when registering a second pack with the same id", () => {
    const registry = createRegistry();
    const original = makeFixturePack({ name: "Original" });
    const duplicate = makeFixturePack({ name: "Duplicate" });

    registry.register(original);

    expect(() => registry.register(duplicate)).toThrow(DuplicatePackError);
    // The original registration is not replaced by the failed duplicate.
    expect(registry.get("fixture_domain")).toBe(original);
  });

  it("get() throws PackNotFoundError for an unregistered id", () => {
    const registry = createRegistry();
    expect(() => registry.get("does_not_exist")).toThrow(PackNotFoundError);
  });

  it("tryGet() returns undefined for an unregistered id instead of throwing", () => {
    const registry = createRegistry();
    expect(registry.tryGet("does_not_exist")).toBeUndefined();
  });

  it("tryGet() returns the pack for a registered id", () => {
    const registry = createRegistry();
    const pack = makeFixturePack();
    registry.register(pack);

    expect(registry.tryGet("fixture_domain")).toBe(pack);
  });

  it("two independently created registries do not share state", () => {
    const registryA = createRegistry();
    const registryB = createRegistry();

    registryA.register(makeFixturePack());

    expect(registryA.list()).toHaveLength(1);
    expect(registryB.list()).toHaveLength(0);
    expect(() => registryB.get("fixture_domain")).toThrow(PackNotFoundError);
  });

  it("forDocumentType() resolves the pack that owns a DB document type", () => {
    const registry = createRegistry();
    const sale = makeFixturePack({
      id: "sale_fixture",
      documentTypes: [
        { id: "AGREEMENT_FIXTURE", slug: "agreement_fixture", label: "Agreement" },
        { id: "DEED_FIXTURE", slug: "deed_fixture", label: "Deed" },
      ],
    });
    registry.register(sale);

    expect(registry.forDocumentType("AGREEMENT_FIXTURE")).toBe(sale);
    expect(registry.forDocumentType("DEED_FIXTURE")).toBe(sale);
    expect(() => registry.forDocumentType("UNKNOWN")).toThrow(PackNotFoundError);
  });

  it("findDocumentTypeBySlug() maps an upload slug to its pack and document type", () => {
    const registry = createRegistry();
    const pack = makeFixturePack();
    registry.register(pack);

    const found = registry.findDocumentTypeBySlug("fixture_domain");
    expect(found?.pack).toBe(pack);
    expect(found?.documentType.id).toBe("FIXTURE_DOMAIN");
    expect(registry.findDocumentTypeBySlug("nope")).toBeUndefined();
  });

  it("throws DuplicateDocumentTypeError when two packs claim the same document type", () => {
    const registry = createRegistry();
    const shared = [{ id: "SHARED", slug: "shared", label: "Shared" }];
    registry.register(makeFixturePack({ id: "domain_a", documentTypes: shared }));

    expect(() =>
      registry.register(makeFixturePack({ id: "domain_b", documentTypes: shared })),
    ).toThrow(DuplicateDocumentTypeError);
    expect(registry.tryGet("domain_b")).toBeUndefined();
  });
});
