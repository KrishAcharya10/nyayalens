import { describe, expect, it } from "vitest";
import {
  CLAUSE_TAXONOMY,
  classifyHeading,
  taxonomyFromSchema,
} from "../src/clauses/clauseTaxonomy.js";
import { runRuleBasedClauseClassification } from "../src/clauses/ruleBasedClauseClassifier.js";
import { getDomainPackRegistry } from "../src/domains/index.js";
import { runRuleBasedNer } from "../src/ner/rulePatterns.js";

const registry = getDomainPackRegistry();
const rental = registry.forDocumentType("RESIDENTIAL_RENTAL");
const land = registry.forDocumentType("LAND_LEASE");
const labelsOf = (pack: typeof rental) => new Set(pack.entitySchema.map((e) => e.label));

// A residential agreement that happens to mention a survey number and a
// lessor - real uploads mix vocabulary in ways the synthetic sets never do.
const MIXED_RENTAL_TEXT =
  "LANDLORD: Asha Rao, hereinafter referred to as the 'Landlord',\n\n" +
  "The building stands on Survey No. 12/3, earlier held by LESSOR: Vikram Shah, a prior owner.\n\n" +
  "1. RENT PAYMENT\nThe Tenant shall pay a monthly rent of ₹25,000.\n\n" +
  "2. LEASE PREMIUM\nNo premium is payable.\n";

describe("document-scoped rule-based NER (Phase 8)", () => {
  it("only emits labels from the allowed set", () => {
    const scoped = runRuleBasedNer(MIXED_RENTAL_TEXT, { allowedLabels: labelsOf(rental) });
    const labels = new Set(scoped.map((e) => e.label));
    expect(labels.has("LANDLORD")).toBe(true);
    expect(labels.has("RENT")).toBe(true);
    expect(labels.has("SURVEY_NUMBER")).toBe(false);
    expect(labels.has("LESSOR")).toBe(false);
  });

  it("without options, keeps the original union behavior", () => {
    const union = runRuleBasedNer(MIXED_RENTAL_TEXT);
    const labels = new Set(union.map((e) => e.label));
    expect(labels.has("SURVEY_NUMBER")).toBe(true);
    expect(labels.has("LESSOR")).toBe(true);
  });
});

describe("document-scoped clause classification (Phase 8)", () => {
  it("taxonomyFromSchema orders by priority, not array position", () => {
    const taxonomy = taxonomyFromSchema([
      { clauseType: "B", headingPattern: /X/, priority: 20 },
      { clauseType: "A", headingPattern: /X/, priority: 10 },
    ]);
    expect(taxonomy.map((t) => t.clauseType)).toEqual(["A", "B"]);
    expect(classifyHeading("X", taxonomy)).toBe("A");
  });

  it("a rental document never gets a land-lease-only clause type", () => {
    const scoped = runRuleBasedClauseClassification(
      MIXED_RENTAL_TEXT,
      taxonomyFromSchema(rental.clauseSchema),
    );
    expect(scoped.map((c) => c.clauseType)).toEqual(["RENT_PAYMENT"]);

    const union = runRuleBasedClauseClassification(MIXED_RENTAL_TEXT);
    expect(union.map((c) => c.clauseType)).toEqual(["RENT_PAYMENT", "LEASE_PREMIUM"]);
  });

  it("the union of both packs' clause schemas keeps the original taxonomy's relative order", () => {
    // The packs now also carry clause types the v2/v3 generators produce
    // (escalation, lock-in, ...); restricted to the original twelve, the
    // merged priority order must still be exactly the original one.
    const original = new Set(CLAUSE_TAXONOMY.map((t) => t.clauseType));
    const byType = new Map(
      [...rental.clauseSchema, ...land.clauseSchema].map((c) => [c.clauseType, c]),
    );
    const merged = taxonomyFromSchema([...byType.values()])
      .map((t) => t.clauseType)
      .filter((t) => original.has(t));
    expect(merged).toEqual(CLAUSE_TAXONOMY.map((t) => t.clauseType));
  });
});
