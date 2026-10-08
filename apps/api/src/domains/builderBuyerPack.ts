// The builder_buyer DomainPack (Phase 8): agreements between a promoter
// (developer) and an allottee for an under-construction unit. Findings
// here are framed as potential issues / review required - whether a term
// is consistent with RERA depends on facts and jurisdiction this system
// does not establish (docs/legal_reference_policy.md).
import { makeDiscretionCheck, makeOneSidedRemedyCheck } from "../risk/factChecks.js";
import { BUILDER_BUYER_EXTRACTION } from "./extractionRules.js";
import type { DomainPack } from "./registry.js";
import { makeMissingClauseCheck } from "../risk/missingClauseCheck.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";
import {
  ARBITRATION_ACT_1996,
  RERA_S13_ADVANCE,
  RERA_S18_COMPENSATION,
} from "./legalReferences.js";

const EXPECTED_CLAUSE_TYPES = [
  "PROJECT",
  "UNIT_DESCRIPTION",
  "CONSIDERATION",
  "PAYMENT_PLAN",
  "POSSESSION",
  "DELAY_COMPENSATION",
  "DEFECTS",
  "CANCELLATION",
  "JURISDICTION",
];

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  PROJECT: "MEDIUM",
  UNIT_DESCRIPTION: "HIGH",
  CONSIDERATION: "HIGH",
  PAYMENT_PLAN: "HIGH",
  POSSESSION: "HIGH",
  DELAY_COMPENSATION: "HIGH",
  DEFECTS: "MEDIUM",
  CANCELLATION: "MEDIUM",
  JURISDICTION: "MEDIUM",
};

export const builderBuyerPack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "builder_buyer",
  name: "Builder-Buyer Agreement",
  description:
    "Agreements between a promoter/developer and an allottee for the sale of a unit in a real-estate project, usually under construction.",
  version: "2026.10.0",
  jurisdiction: { country: "IN", referenceVersion: "2026-10" },
  documentTypes: [
    {
      id: "BUILDER_BUYER_AGREEMENT",
      slug: "builder_buyer_agreement",
      label: "Builder-Buyer Agreement",
    },
  ],

  entitySchema: [
    { label: "PROMOTER", displayName: "Promoter", coreType: "PARTY" },
    { label: "ALLOTTEE", displayName: "Allottee", coreType: "PARTY" },
    { label: "PROJECT", displayName: "Project", coreType: "TEXT" },
    { label: "PROJECT_ADDRESS", displayName: "Project address", coreType: "ADDRESS" },
    {
      label: "REGISTRATION_REFERENCE",
      displayName: "RERA registration no.",
      coreType: "PROPERTY_IDENTIFIER",
    },
    { label: "UNIT", displayName: "Unit", coreType: "PROPERTY_IDENTIFIER" },
    { label: "CARPET_AREA", displayName: "Carpet area", coreType: "AREA" },
    { label: "SALE_CONSIDERATION", displayName: "Total consideration", coreType: "MONEY" },
    { label: "BOOKING_AMOUNT", displayName: "Booking amount", coreType: "MONEY" },
    { label: "INSTALMENT_AMOUNT", displayName: "Instalment", coreType: "MONEY" },
    { label: "MAINTENANCE_CHARGE", displayName: "Maintenance charge", coreType: "MONEY" },
    { label: "PAYMENT_PLAN", displayName: "Payment plan", coreType: "TEXT" },
    { label: "CONSTRUCTION_STATUS", displayName: "Construction status", coreType: "TEXT" },
    { label: "POSSESSION_DATE", displayName: "Possession date", coreType: "DATE" },
    { label: "EXECUTION_DATE", displayName: "Agreement date", coreType: "DATE" },
    { label: "GRACE_PERIOD", displayName: "Grace period", coreType: "DURATION" },
    {
      label: "DEFECT_LIABILITY_PERIOD",
      displayName: "Defect liability period",
      coreType: "DURATION",
    },
    { label: "REFUND_PERIOD", displayName: "Refund period", coreType: "DURATION" },
    { label: "DELAY_COMPENSATION", displayName: "Delay compensation rate", coreType: "PERCENT" },
    { label: "CANCELLATION_CHARGE", displayName: "Cancellation charge", coreType: "PERCENT" },
    { label: "ADDRESS", displayName: "Place of execution", coreType: "LOCATION" },
    { label: "JURISDICTION", displayName: "Jurisdiction", coreType: "LOCATION" },
    { label: "WITNESS", displayName: "Witness", coreType: "PERSON" },
  ],
  partyTerms: {
    PROMOTER: ["Promoter", "Developer", "Builder"],
    ALLOTTEE: ["Allottee", "Allottees"],
  },
  // Shown on the workspace Overview card, in this order (first value of each).
  overviewFields: [
    "PROMOTER",
    "ALLOTTEE",
    "PROJECT",
    "UNIT",
    "SALE_CONSIDERATION",
    "POSSESSION_DATE",
  ],
  extraction: BUILDER_BUYER_EXTRACTION,

  clauseSchema: [
    {
      clauseType: "PAYMENT_PLAN",
      headingPattern: /PAYMENT\s+PLAN|SCHEDULE\s+OF\s+PAYMENT|INSTAL/i,
      priority: 10,
    },
    { clauseType: "CANCELLATION", headingPattern: /CANCELLATION|WITHDRAWAL/i, priority: 20 },
    { clauseType: "REFUND", headingPattern: /REFUND/i, priority: 30 },
    { clauseType: "DELAY_COMPENSATION", headingPattern: /DELAY|COMPENSATION/i, priority: 40 },
    { clauseType: "HANDOVER", headingPattern: /HANDOVER|HAND\s+OVER|TAKING\s+OVER/i, priority: 50 },
    { clauseType: "POSSESSION", headingPattern: /POSSESSION/i, priority: 60 },
    { clauseType: "DEFECTS", headingPattern: /DEFECT/i, priority: 70 },
    { clauseType: "MAINTENANCE", headingPattern: /MAINTENANCE/i, priority: 80 },
    {
      clauseType: "UNIT_DESCRIPTION",
      headingPattern: /\bUNIT\b|APARTMENT|\bFLAT\b/i,
      priority: 90,
    },
    { clauseType: "PROJECT", headingPattern: /PROJECT/i, priority: 100 },
    { clauseType: "CONSIDERATION", headingPattern: /CONSIDERATION|PRICE|BOOKING/i, priority: 110 },
    { clauseType: "REGISTRATION", headingPattern: /REGISTRATION|STAMP/i, priority: 120 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE|ARBITRATION/i, priority: 130 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION|GOVERNING\s+LAW/i, priority: 140 },
  ],

  relationSchema: [
    { relationType: "PROMOTER_OF", subjectEntityLabel: "PROMOTER", objectEntityLabel: "PROJECT" },
    { relationType: "ALLOTTED_TO", subjectEntityLabel: "UNIT", objectEntityLabel: "ALLOTTEE" },
    { relationType: "PART_OF_PROJECT", subjectEntityLabel: "UNIT", objectEntityLabel: "PROJECT" },
    { relationType: "HAS_UNIT", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "UNIT" },
    {
      relationType: "HAS_CARPET_AREA",
      subjectEntityLabel: "UNIT",
      objectEntityLabel: "CARPET_AREA",
    },
    {
      relationType: "HAS_CONSIDERATION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "SALE_CONSIDERATION",
    },
    {
      relationType: "HAS_PAYMENT_PLAN",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "PAYMENT_PLAN",
    },
    {
      relationType: "HAS_POSSESSION_DATE",
      subjectEntityLabel: "UNIT",
      objectEntityLabel: "POSSESSION_DATE",
    },
    { relationType: "HANDOVER_TO", subjectEntityLabel: "PROMOTER", objectEntityLabel: "ALLOTTEE" },
    { relationType: "REFUND_TO", subjectEntityLabel: "PROMOTER", objectEntityLabel: "ALLOTTEE" },
    {
      relationType: "MUST_PAY",
      subjectEntityLabel: "ALLOTTEE",
      objectEntityLabel: "BOOKING_AMOUNT",
    },
    {
      relationType: "MUST_PAY",
      subjectEntityLabel: "ALLOTTEE",
      objectEntityLabel: "INSTALMENT_AMOUNT",
    },
    {
      relationType: "MUST_PAY",
      subjectEntityLabel: "ALLOTTEE",
      objectEntityLabel: "MAINTENANCE_CHARGE",
    },
    {
      relationType: "HAS_REGISTRATION",
      subjectEntityLabel: "PROJECT",
      objectEntityLabel: "REGISTRATION_REFERENCE",
    },
    {
      relationType: "LOCATED_AT",
      subjectEntityLabel: "PROJECT",
      objectEntityLabel: "PROJECT_ADDRESS",
    },
    {
      relationType: "HAS_JURISDICTION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "JURISDICTION",
    },
  ],

  obligationSchema: [
    {
      action: "PAY",
      actorLabels: ["ALLOTTEE"],
      description: "Pay the booking amount, instalments or charges.",
    },
    {
      action: "DELIVER_POSSESSION",
      actorLabels: ["PROMOTER"],
      description: "Hand over possession of the unit.",
    },
    {
      action: "PAY_DELAY_COMPENSATION",
      actorLabels: ["PROMOTER"],
      description: "Compensate the allottee for delayed possession.",
    },
    {
      action: "RECTIFY_DEFECTS",
      actorLabels: ["PROMOTER"],
      description: "Rectify structural or workmanship defects.",
    },
    {
      action: "REFUND",
      actorLabels: ["PROMOTER"],
      description: "Refund amounts paid on cancellation.",
    },
    {
      action: "TAKE_POSSESSION",
      actorLabels: ["ALLOTTEE"],
      description: "Take possession after the occupancy certificate.",
    },
  ],

  riskSchema: {
    expectedClauseTypes: EXPECTED_CLAUSE_TYPES,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      makeDiscretionCheck(["POSSESSION"]),
      makeOneSidedRemedyCheck(["CANCELLATION"]),
      makeMissingClauseCheck(EXPECTED_CLAUSE_TYPES, MISSING_CLAUSE_SEVERITY),
    ],
    comparisonChecks: [],
  },

  consistencyRules: [
    {
      id: "bb_consideration_single",
      kind: "SINGLE_VALUE",
      label: "SALE_CONSIDERATION",
      category: "FINANCIAL_CONTRADICTION",
      description: "The total consideration should be stated consistently.",
    },
    {
      id: "bb_booking_single",
      kind: "SINGLE_VALUE",
      label: "BOOKING_AMOUNT",
      category: "FINANCIAL_CONTRADICTION",
      description: "The booking amount should be stated consistently.",
    },
    {
      id: "bb_carpet_single",
      kind: "SINGLE_VALUE",
      label: "CARPET_AREA",
      category: "PROPERTY_AREA_CONTRADICTION",
      description: "The carpet area should be stated consistently.",
    },
    {
      id: "bb_unit_single",
      kind: "SINGLE_VALUE",
      label: "UNIT",
      category: "PROPERTY_IDENTIFIER_CONTRADICTION",
      description: "The unit should be identified consistently.",
    },
    {
      id: "bb_possession_single",
      kind: "SINGLE_VALUE",
      label: "POSSESSION_DATE",
      category: "DATE_CONTRADICTION",
      description: "The possession date should be stated consistently.",
    },
    {
      id: "bb_payment_total",
      kind: "SUM",
      parts: ["BOOKING_AMOUNT", "INSTALMENT_AMOUNT"],
      total: "SALE_CONSIDERATION",
      category: "PAYMENT_TOTAL_MISMATCH",
      description: "The booking amount plus all instalments should equal the total consideration.",
    },
    {
      id: "bb_possession_after_agreement",
      kind: "DATE_ORDER",
      before: "EXECUTION_DATE",
      after: "POSSESSION_DATE",
      category: "DATE_CONTRADICTION",
      description: "Possession should not be due before the agreement date.",
    },
    {
      id: "bb_instalment_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY",
      objectLabel: "INSTALMENT_AMOUNT",
      expectedActor: "ALLOTTEE",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "Instalments are expected to be paid by the allottee.",
    },
  ],

  detection: {
    titlePatterns: [
      /\bBUILDER[\s-]+BUYER\b/i,
      /\bAGREEMENT\s+FOR\s+SALE\s+OF\s+(?:AN?\s+)?(?:APARTMENT|FLAT|UNIT)\b/i,
      /\bALLOTMENT\b/i,
    ],
    lexicalPatterns: [
      /\bpromoter\b/i,
      /\ballottee\b/i,
      /\bRERA\b/,
      /\bcarpet\s+area\b/i,
      /\boccupancy\s+certificate\b/i,
      /\bconstruction[\s-]+linked\b/i,
    ],
  },

  legalFrameworks: [RERA_S13_ADVANCE, RERA_S18_COMPENSATION, ARBITRATION_ACT_1996],
  generatorConfig: { module: "research/generator/v3/domains/builder_buyer.py" },
};
