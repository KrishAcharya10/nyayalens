import { describe, expect, it } from "vitest";
import {
  DuplicatePackError,
  PackNotFoundError,
  createRegistry,
  type DomainPack,
} from "../src/domains/registry.js";

// Minimal fixture packs - deliberately not a real rental/land-lease
// ontology (that worked mapping lives in docs/phase8/domainpack_design.md
// as a paper exercise only). These tests exercise registry mechanics
// only: register, retrieve, duplicate-id detection, missing-pack error.
function makeFixturePack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    id: "fixture_domain",
    name: "Fixture Domain",
    version: "0.0.1",
    jurisdiction: { country: "IN", referenceVersion: "2026-09" },
    documentTypes: [{ id: "FIXTURE", label: "Fixture" }],
    entitySchema: [],
    clauseSchema: [],
    relationSchema: [],
    riskSchema: {
      expectedClauseTypes: [],
      missingClauseSeverity: {},
      perClauseChecks: [],
      comparisonChecks: [],
    },
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
});
