// The sale_property DomainPack (Phase 8): agreements to sell and sale
// deeds for flats, houses and land. One domain, two document types - an
// agreement to sell records promises (advance now, balance and sale deed
// later); a sale deed records the completed conveyance - so expected
// clauses are looked up per document type.
import { makeOneSidedRemedyCheck } from "../risk/factChecks.js";
import { SALE_PROPERTY_EXTRACTION } from "./extractionRules.js";
import type { DomainPack } from "./registry.js";
import { makeMissingClauseCheckByDocumentType } from "../risk/missingClauseCheck.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";
import { ARBITRATION_ACT_1996, REGISTRATION_ACT_S17, TPA_S54_SALE } from "./legalReferences.js";

const EXPECTED_BY_DOCUMENT_TYPE: Record<string, string[]> = {
  AGREEMENT_TO_SELL: [
    "PROPERTY_DESCRIPTION",
    "CONSIDERATION",
    "ADVANCE",
    "BALANCE_PAYMENT",
    "POSSESSION",
    "ENCUMBRANCE",
    "DEFAULT",
    "JURISDICTION",
  ],
  SALE_DEED: ["PROPERTY_DESCRIPTION", "CONSIDERATION", "POSSESSION", "ENCUMBRANCE", "JURISDICTION"],
};

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  PROPERTY_DESCRIPTION: "HIGH",
  CONSIDERATION: "HIGH",
  ADVANCE: "MEDIUM",
  BALANCE_PAYMENT: "HIGH",
  POSSESSION: "HIGH",
  ENCUMBRANCE: "HIGH",
  DEFAULT: "MEDIUM",
  JURISDICTION: "MEDIUM",
};

export const salePropertyPack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "sale_property",
  name: "Sale of Property",
  description:
    "Agreements to sell and sale deeds transferring a flat, house or land from a seller (vendor) to a buyer (purchaser).",
  version: "2026.10.0",
  jurisdiction: { country: "IN", referenceVersion: "2026-10" },
  documentTypes: [
    { id: "AGREEMENT_TO_SELL", slug: "agreement_to_sell", label: "Agreement to Sell" },
    { id: "SALE_DEED", slug: "sale_deed", label: "Sale Deed" },
  ],

  entitySchema: [
    { label: "SELLER", displayName: "Seller", coreType: "PARTY" },
    { label: "BUYER", displayName: "Buyer", coreType: "PARTY" },
    { label: "POWER_OF_ATTORNEY", displayName: "Power of attorney holder", coreType: "PARTY" },
    { label: "PROPERTY", displayName: "Property", coreType: "TEXT" },
    { label: "PROPERTY_ADDRESS", displayName: "Property address", coreType: "ADDRESS" },
    { label: "SURVEY_NUMBER", displayName: "Survey number", coreType: "PROPERTY_IDENTIFIER" },
    { label: "CTS_NUMBER", displayName: "CTS number", coreType: "PROPERTY_IDENTIFIER" },
    { label: "PLOT_NUMBER", displayName: "Plot number", coreType: "PROPERTY_IDENTIFIER" },
    { label: "FLAT_NUMBER", displayName: "Flat number", coreType: "PROPERTY_IDENTIFIER" },
    { label: "KHATA_NUMBER", displayName: "Khata number", coreType: "PROPERTY_IDENTIFIER" },
    { label: "LAND_AREA", displayName: "Land area", coreType: "AREA" },
    { label: "BUILT_UP_AREA", displayName: "Built-up area", coreType: "AREA" },
    { label: "CARPET_AREA", displayName: "Carpet area", coreType: "AREA" },
    { label: "SALE_CONSIDERATION", displayName: "Sale consideration", coreType: "MONEY" },
    { label: "ADVANCE_AMOUNT", displayName: "Advance", coreType: "MONEY" },
    { label: "BALANCE_AMOUNT", displayName: "Balance", coreType: "MONEY" },
    { label: "STAMP_DUTY", displayName: "Stamp duty", coreType: "MONEY" },
    { label: "REGISTRATION_FEE", displayName: "Registration fee", coreType: "MONEY" },
    { label: "LOAN", displayName: "Loan", coreType: "MONEY" },
    { label: "AGREEMENT_DATE", displayName: "Agreement date", coreType: "DATE" },
    { label: "POSSESSION_DATE", displayName: "Possession date", coreType: "DATE" },
    { label: "REGISTRATION_DATE", displayName: "Registration date", coreType: "DATE" },
    { label: "ENCUMBRANCE", displayName: "Encumbrance", coreType: "TEXT" },
    { label: "TITLE", displayName: "Title", coreType: "TEXT" },
    { label: "BOUNDARY", displayName: "Boundary", coreType: "TEXT" },
    { label: "BANK", displayName: "Bank (mortgage holder)", coreType: "ORGANIZATION" },
    { label: "ADDRESS", displayName: "Place of execution", coreType: "LOCATION" },
    { label: "JURISDICTION", displayName: "Jurisdiction", coreType: "LOCATION" },
    { label: "WITNESS", displayName: "Witness", coreType: "PERSON" },
  ],
  partyTerms: {
    SELLER: ["Seller", "Vendor", "Transferor"],
    BUYER: ["Buyer", "Purchaser", "Transferee"],
  },
  // Shown on the workspace Overview card, in this order (first value of each).
  overviewFields: [
    "SELLER",
    "BUYER",
    "PROPERTY",
    "SALE_CONSIDERATION",
    "ADVANCE_AMOUNT",
    "BALANCE_AMOUNT",
    "POSSESSION_DATE",
    "REGISTRATION_DATE",
  ],
  extraction: SALE_PROPERTY_EXTRACTION,

  clauseSchema: [
    { clauseType: "STAMP_DUTY", headingPattern: /STAMP/i, priority: 10 },
    { clauseType: "REGISTRATION", headingPattern: /REGISTRATION/i, priority: 20 },
    { clauseType: "ADVANCE", headingPattern: /ADVANCE|EARNEST|TOKEN/i, priority: 30 },
    { clauseType: "BALANCE_PAYMENT", headingPattern: /BALANCE/i, priority: 40 },
    {
      clauseType: "PAYMENT_SCHEDULE",
      headingPattern:
        /PAYMENT\s+SCHEDULE|SCHEDULE\s+OF\s+PAYMENT|MODE\s+OF\s+PAYMENT|PAYMENT\s+TERMS/i,
      priority: 50,
    },
    { clauseType: "CONSIDERATION", headingPattern: /CONSIDERATION|PRICE/i, priority: 60 },
    { clauseType: "POSSESSION", headingPattern: /POSSESSION/i, priority: 70 },
    {
      clauseType: "TITLE_TRANSFER",
      headingPattern: /TRANSFER|CONVEYANCE|EXECUTION\s+OF\s+(?:THE\s+)?SALE\s+DEED/i,
      priority: 80,
    },
    { clauseType: "ENCUMBRANCE", headingPattern: /ENCUMBRANCE|MORTGAGE|LIEN/i, priority: 90 },
    { clauseType: "TITLE", headingPattern: /TITLE/i, priority: 100 },
    { clauseType: "REPRESENTATIONS", headingPattern: /REPRESENTATION|COVENANT/i, priority: 110 },
    { clauseType: "WARRANTIES", headingPattern: /WARRANT/i, priority: 120 },
    { clauseType: "TAXES", headingPattern: /\bTAX|OUTGOING|DUES/i, priority: 130 },
    { clauseType: "DEFAULT", headingPattern: /DEFAULT|BREACH/i, priority: 140 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION|CANCELLATION/i, priority: 150 },
    { clauseType: "INDEMNITY", headingPattern: /INDEMNI/i, priority: 160 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE|ARBITRATION/i, priority: 170 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION|GOVERNING\s+LAW/i, priority: 180 },
    { clauseType: "SCHEDULE_PROPERTY", headingPattern: /^\s*SCHEDULE/i, priority: 185 },
    {
      clauseType: "PROPERTY_DESCRIPTION",
      headingPattern: /PROPERTY|DESCRIPTION|PREMISES/i,
      priority: 190,
    },
  ],

  relationSchema: [
    { relationType: "SELLS", subjectEntityLabel: "SELLER", objectEntityLabel: "PROPERTY" },
    { relationType: "BUYS", subjectEntityLabel: "BUYER", objectEntityLabel: "PROPERTY" },
    { relationType: "OWNS", subjectEntityLabel: "SELLER", objectEntityLabel: "PROPERTY" },
    { relationType: "TRANSFERS", subjectEntityLabel: "SELLER", objectEntityLabel: "BUYER" },
    { relationType: "HAS_PROPERTY", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "PROPERTY" },
    {
      relationType: "HAS_SURVEY_NUMBER",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "SURVEY_NUMBER",
    },
    {
      relationType: "HAS_IDENTIFIER",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "CTS_NUMBER",
    },
    {
      relationType: "HAS_IDENTIFIER",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "PLOT_NUMBER",
    },
    {
      relationType: "HAS_IDENTIFIER",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "FLAT_NUMBER",
    },
    {
      relationType: "HAS_IDENTIFIER",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "KHATA_NUMBER",
    },
    { relationType: "HAS_AREA", subjectEntityLabel: "PROPERTY", objectEntityLabel: "LAND_AREA" },
    {
      relationType: "HAS_AREA",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "BUILT_UP_AREA",
    },
    { relationType: "HAS_AREA", subjectEntityLabel: "PROPERTY", objectEntityLabel: "CARPET_AREA" },
    {
      relationType: "HAS_CONSIDERATION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "SALE_CONSIDERATION",
    },
    {
      relationType: "HAS_ADVANCE",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "ADVANCE_AMOUNT",
    },
    {
      relationType: "HAS_BALANCE",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "BALANCE_AMOUNT",
    },
    {
      relationType: "HAS_POSSESSION_DATE",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "POSSESSION_DATE",
    },
    {
      relationType: "HAS_REGISTRATION_DATE",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "REGISTRATION_DATE",
    },
    {
      relationType: "ENCUMBERED_BY",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "ENCUMBRANCE",
    },
    { relationType: "MORTGAGED_TO", subjectEntityLabel: "PROPERTY", objectEntityLabel: "BANK" },
    {
      relationType: "LOCATED_AT",
      subjectEntityLabel: "PROPERTY",
      objectEntityLabel: "PROPERTY_ADDRESS",
    },
    { relationType: "BOUNDED_BY", subjectEntityLabel: "PROPERTY", objectEntityLabel: "BOUNDARY" },
    {
      relationType: "AUTHORISED_BY",
      subjectEntityLabel: "SELLER",
      objectEntityLabel: "POWER_OF_ATTORNEY",
    },
    {
      relationType: "DERIVES_TITLE_FROM",
      subjectEntityLabel: "SELLER",
      objectEntityLabel: "TITLE",
    },
    { relationType: "MUST_PAY", subjectEntityLabel: "BUYER", objectEntityLabel: "ADVANCE_AMOUNT" },
    { relationType: "MUST_PAY", subjectEntityLabel: "BUYER", objectEntityLabel: "BALANCE_AMOUNT" },
    { relationType: "MUST_PAY", subjectEntityLabel: "BUYER", objectEntityLabel: "STAMP_DUTY" },
    {
      relationType: "HAS_JURISDICTION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "JURISDICTION",
    },
  ],

  obligationSchema: [
    {
      action: "PAY",
      actorLabels: ["BUYER"],
      description: "Pay the advance, balance, stamp duty or fees.",
    },
    {
      action: "DELIVER_POSSESSION",
      actorLabels: ["SELLER"],
      description: "Hand over vacant possession.",
    },
    {
      action: "EXECUTE_SALE_DEED",
      actorLabels: ["SELLER", "BUYER"],
      description: "Execute and register the sale deed.",
    },
    {
      action: "CLEAR_ENCUMBRANCE",
      actorLabels: ["SELLER"],
      description: "Clear any loan, mortgage or charge on the property.",
    },
    {
      action: "PAY_TAXES",
      actorLabels: ["SELLER"],
      description: "Clear property taxes and dues up to the transfer date.",
    },
    {
      action: "PRODUCE_TITLE_DOCUMENTS",
      actorLabels: ["SELLER"],
      description: "Hand over original title documents.",
    },
    {
      action: "REFUND_ADVANCE",
      actorLabels: ["SELLER"],
      description: "Return the advance on the seller's default.",
    },
    {
      action: "INDEMNIFY",
      actorLabels: ["SELLER"],
      description: "Indemnify the buyer against title defects.",
    },
  ],

  riskSchema: {
    expectedClauseTypes: [...new Set(Object.values(EXPECTED_BY_DOCUMENT_TYPE).flat())],
    expectedClauseTypesByDocumentType: EXPECTED_BY_DOCUMENT_TYPE,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      makeOneSidedRemedyCheck(["DEFAULT", "TERMINATION"]),
      makeMissingClauseCheckByDocumentType(EXPECTED_BY_DOCUMENT_TYPE, MISSING_CLAUSE_SEVERITY),
    ],
    comparisonChecks: [],
  },

  consistencyRules: [
    {
      id: "sale_consideration_single",
      kind: "SINGLE_VALUE",
      label: "SALE_CONSIDERATION",
      category: "FINANCIAL_CONTRADICTION",
      description: "The sale consideration should be stated consistently.",
    },
    {
      id: "sale_advance_single",
      kind: "SINGLE_VALUE",
      label: "ADVANCE_AMOUNT",
      category: "FINANCIAL_CONTRADICTION",
      description: "The advance should be stated consistently.",
    },
    {
      id: "sale_balance_single",
      kind: "SINGLE_VALUE",
      label: "BALANCE_AMOUNT",
      category: "FINANCIAL_CONTRADICTION",
      description: "The balance should be stated consistently.",
    },
    {
      id: "sale_carpet_single",
      kind: "SINGLE_VALUE",
      label: "CARPET_AREA",
      category: "PROPERTY_AREA_CONTRADICTION",
      description: "The carpet area should be stated consistently.",
    },
    {
      id: "sale_builtup_single",
      kind: "SINGLE_VALUE",
      label: "BUILT_UP_AREA",
      category: "PROPERTY_AREA_CONTRADICTION",
      description: "The built-up area should be stated consistently.",
    },
    {
      id: "sale_land_area_single",
      kind: "SINGLE_VALUE",
      label: "LAND_AREA",
      category: "PROPERTY_AREA_CONTRADICTION",
      description: "The land area should be stated consistently.",
    },
    {
      id: "sale_survey_single",
      kind: "SINGLE_VALUE",
      label: "SURVEY_NUMBER",
      category: "PROPERTY_IDENTIFIER_CONTRADICTION",
      description: "The survey number should be stated consistently.",
    },
    {
      id: "sale_cts_single",
      kind: "SINGLE_VALUE",
      label: "CTS_NUMBER",
      category: "PROPERTY_IDENTIFIER_CONTRADICTION",
      description: "The CTS number should be stated consistently.",
    },
    {
      id: "sale_flat_single",
      kind: "SINGLE_VALUE",
      label: "FLAT_NUMBER",
      category: "PROPERTY_IDENTIFIER_CONTRADICTION",
      description: "The flat number should be stated consistently.",
    },
    {
      id: "sale_plot_single",
      kind: "SINGLE_VALUE",
      label: "PLOT_NUMBER",
      category: "PROPERTY_IDENTIFIER_CONTRADICTION",
      description: "The plot number should be stated consistently.",
    },
    {
      id: "sale_possession_single",
      kind: "SINGLE_VALUE",
      label: "POSSESSION_DATE",
      category: "DATE_CONTRADICTION",
      description: "The possession date should be stated consistently.",
    },
    {
      id: "sale_payment_total",
      kind: "SUM",
      parts: ["ADVANCE_AMOUNT", "BALANCE_AMOUNT"],
      total: "SALE_CONSIDERATION",
      category: "PAYMENT_TOTAL_MISMATCH",
      description: "Advance plus balance should equal the sale consideration.",
    },
    {
      id: "sale_possession_after_agreement",
      kind: "DATE_ORDER",
      before: "AGREEMENT_DATE",
      after: "POSSESSION_DATE",
      category: "DATE_CONTRADICTION",
      description: "Possession should not be due before the agreement date.",
    },
    {
      id: "sale_balance_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY",
      objectLabel: "BALANCE_AMOUNT",
      expectedActor: "BUYER",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "The balance is expected to be paid by the buyer.",
    },
    {
      id: "sale_advance_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY",
      objectLabel: "ADVANCE_AMOUNT",
      expectedActor: "BUYER",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "The advance is expected to be paid by the buyer.",
    },
  ],

  detection: {
    documentTypes: [
      {
        documentType: "SALE_DEED",
        pattern: /\bSALE\s+DEED\b|\bDEED\s+OF\s+(?:ABSOLUTE\s+)?SALE\b|\bCONVEYANCE\s+DEED\b/i,
      },
    ],
    titlePatterns: [
      /\bAGREEMENT\s+(?:TO|FOR)\s+(?:SELL|SALE)\b/i,
      /\bSALE\s+DEED\b/i,
      /\bDEED\s+OF\s+(?:ABSOLUTE\s+)?SALE\b/i,
      /\bCONVEYANCE\s+DEED\b/i,
    ],
    lexicalPatterns: [
      /\bsale\s+consideration\b/i,
      /\b(?:vendor|seller)\b/i,
      /\b(?:purchaser|buyer)\b/i,
      /\bsale\s+deed\b/i,
      /\b(?:earnest\s+money|advance)\b/i,
      /\bvacant\s+possession\b/i,
    ],
  },

  legalFrameworks: [TPA_S54_SALE, REGISTRATION_ACT_S17, ARBITRATION_ACT_1996],
  generatorConfig: { module: "research/generator/v3/domains/sale_property.py" },
};
