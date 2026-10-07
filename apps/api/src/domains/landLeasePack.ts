// The land_lease DomainPack - Phase 8 Step 2 migration
// (docs/phase8/step2_migration_notes.md has the full attribution table
// and how it was verified against research/generator/generator.py and
// adversarial_generator.py, not guessed).
//
// landUseContradictionCheck moved here verbatim EXCEPT for the removal of
// its pre-migration inline `if (context.documentType !== "LAND_LEASE")
// return [];` guard (see riskEnginePass2.test.ts's updated test and
// docs/phase8/step2_migration_notes.md for why removing it is safe): the
// check now only ever runs at all when this pack is the one resolved for
// a document, which is the pack-scoped replacement for that guard.
import type { DomainPack } from "./registry.js";
import { asymmetricObligationCheck } from "../risk/sharedChecks.js";
import { makeMissingClauseCheck } from "../risk/missingClauseCheck.js";
import { clauseToEvidence, entityToEvidence } from "../risk/types.js";
import type { RiskCheck, RiskEngineContext, RiskFinding } from "../risk/types.js";

// --- Category 4: land use contradiction ------------------------------------

const NON_AGRICULTURAL_USE_PATTERNS = [
  /warehouse/i,
  /commercial retail/i,
  /industrial/i,
  /construction of/i,
];

const landUseContradictionCheck: RiskCheck = {
  name: "land_use_type_vs_permitted_use",
  run(context: RiskEngineContext): RiskFinding[] {
    const landUseTypeEntity = context.entities.find((e) => e.label === "LAND_USE_TYPE");
    const restrictionClause = context.clauses.find((c) => c.clauseType === "LAND_USE_RESTRICTION");
    if (!landUseTypeEntity?.text || !restrictionClause?.text) return [];

    const isAgricultural =
      /agricultural/i.test(landUseTypeEntity.text) &&
      !/non-agricultural/i.test(landUseTypeEntity.text);
    if (!isAgricultural) return [];

    const describesNonAgriculturalUse = NON_AGRICULTURAL_USE_PATTERNS.some((p) =>
      p.test(restrictionClause.text ?? ""),
    );
    if (!describesNonAgriculturalUse) return [];

    // No conversion clause exists anywhere in this generator's output, so
    // there's nothing further to check for its absence here - see
    // adversarial_test_design.md category 4's construction note.
    return [
      {
        category: "LAND_USE_CONTRADICTION",
        severity: "HIGH",
        reason:
          "The land is classified as Agricultural, but the permitted-use clause describes a use that " +
          "typically requires non-agricultural land conversion, with no conversion clause present in " +
          "this document. This may be a potentially significant inconsistency and warrants review " +
          "before signing.",
        pass: "PASS_2",
        evidence: [
          entityToEvidence(context.documentId, landUseTypeEntity),
          clauseToEvidence(context.documentId, restrictionClause),
        ],
      },
    ];
  },
};

// --- Expected clauses / missing-clause severities --------------------------
// Verbatim from the pre-migration EXPECTED_CLAUSE_TYPES.LAND_LEASE and the
// land-lease-relevant entries of MISSING_CLAUSE_SEVERITY in the old
// pass1PerClause.ts.

const EXPECTED_CLAUSE_TYPES = [
  "LEASE_DURATION",
  "LEASE_PREMIUM",
  "RENT_PAYMENT",
  "LAND_USE_RESTRICTION",
  "TERMINATION",
  "DISPUTE_RESOLUTION",
  "JURISDICTION",
];

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  DISPUTE_RESOLUTION: "MEDIUM",
  JURISDICTION: "MEDIUM",
  LEASE_PREMIUM: "HIGH",
  TERMINATION: "HIGH",
  LEASE_DURATION: "HIGH",
  RENT_PAYMENT: "HIGH",
  LAND_USE_RESTRICTION: "MEDIUM",
};

export const landLeasePack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "LAND_LEASE",
  name: "Land Lease Deed",
  version: "2026.09.0",

  jurisdiction: {
    country: "IN",
    referenceVersion: "2026-09",
  },

  documentTypes: [{ id: "LAND_LEASE", label: "Land Lease" }],

  // Attribution verified against research/generator/generator.py's
  // build_land_lease() (LESSOR/LESSEE/SURVEY_NUMBER/LAND_AREA/
  // LAND_USE_TYPE only ever emitted there) - RENT/DURATION/NOTICE_PERIOD/
  // ADDRESS are shared with residential_rental and appear in both packs'
  // entitySchema identically. KHATA_NUMBER/EASEMENT_RIGHT are the two
  // untested extensions rulePatterns.ts already documents as "real Indian
  // land-record concepts... UNTESTED against synthetic ground truth" -
  // attributed here on that same semantic basis (land-record concepts),
  // not because any generated document exercises them - see the
  // migration notes for the one caveat this attribution carries for real
  // (non-synthetic) uploads.
  entitySchema: [
    { label: "LESSOR", displayName: "Lessor" },
    { label: "LESSEE", displayName: "Lessee" },
    { label: "SURVEY_NUMBER", displayName: "Survey number" },
    { label: "LAND_AREA", displayName: "Land area" },
    { label: "LAND_USE_TYPE", displayName: "Land use classification" },
    { label: "LEASE_PREMIUM", displayName: "Lease premium" },
    { label: "KHATA_NUMBER", displayName: "Khata number" },
    { label: "EASEMENT_RIGHT", displayName: "Easement right" },
    { label: "RENT", displayName: "Rent" },
    { label: "DURATION", displayName: "Duration" },
    { label: "NOTICE_PERIOD", displayName: "Notice period" },
    { label: "ADDRESS", displayName: "Property address" },
  ],

  // Priorities mirror the pre-migration CLAUSE_TAXONOMY array's position
  // (position * 10) - see rentalPack.ts's identical note. CROP_OR_
  // CULTIVATION_RIGHTS is attributed here on the same semantic basis as
  // KHATA_NUMBER/EASEMENT_RIGHT above (never emitted by the generator for
  // either domain today, so this attribution has zero effect on any
  // existing document).
  clauseSchema: [
    { clauseType: "LEASE_PREMIUM", headingPattern: /PREMIUM/i, priority: 10 },
    { clauseType: "LEASE_DURATION", headingPattern: /DURATION/i, priority: 20 },
    { clauseType: "RENT_PAYMENT", headingPattern: /RENT/i, priority: 40 },
    { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i, priority: 50 },
    { clauseType: "ENCUMBRANCE_DECLARATION", headingPattern: /ENCUMBRANCE/i, priority: 70 },
    { clauseType: "LAND_USE_RESTRICTION", headingPattern: /PERMITTED USE|LAND USE/i, priority: 80 },
    { clauseType: "CROP_OR_CULTIVATION_RIGHTS", headingPattern: /CROP|CULTIVATION|HARVEST/i, priority: 90 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION/i, priority: 100 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE/i, priority: 110 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION/i, priority: 120 },
  ],

  relationSchema: [],

  riskSchema: {
    expectedClauseTypes: EXPECTED_CLAUSE_TYPES,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [makeMissingClauseCheck(EXPECTED_CLAUSE_TYPES, MISSING_CLAUSE_SEVERITY)],
    // asymmetricObligationCheck is domain-agnostic (Step 1 audit) - both
    // packs register the SAME check instance rather than one pack
    // arbitrarily owning it. landUseContradictionCheck is land_lease-only
    // by registration, replacing its old inline documentType guard.
    comparisonChecks: [asymmetricObligationCheck, landUseContradictionCheck],
  },

  legalFrameworks: [],
};
