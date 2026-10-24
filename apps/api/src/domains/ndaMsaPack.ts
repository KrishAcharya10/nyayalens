// The nda_msa DomainPack (Phase 8): one-way and mutual non-disclosure
// agreements, service agreements and master service agreements. Party
// roles differ by document type: an NDA has a Disclosing and a Receiving
// Party, a mutual NDA has two CONTRACTING_PARTY entities that each
// disclose and receive, and a service agreement has a Client and a
// Service Provider.
import {
  makeOneSidedRemedyCheck,
  oneWayMutualConfidentialityCheck,
  uncappedLiabilityCheck,
} from "../risk/factChecks.js";
import { NDA_MSA_EXTRACTION } from "./extractionRules.js";
import type { DomainPack } from "./registry.js";
import { makeMissingClauseCheckByDocumentType } from "../risk/missingClauseCheck.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";
import {
  ARBITRATION_ACT_1996,
  CONTRACT_ACT_S73_S74_DAMAGES,
  DPDP_ACT_2023,
} from "./legalReferences.js";

const NDA_EXPECTED = ["DEFINITIONS", "CONFIDENTIALITY", "EXCLUSIONS", "TERM", "JURISDICTION"];
const MSA_EXPECTED = [
  "SCOPE_OF_SERVICES",
  "FEES",
  "PAYMENT_TERMS",
  "CONFIDENTIALITY",
  "LIMITATION_OF_LIABILITY",
  "TERMINATION",
  "JURISDICTION",
];
const EXPECTED_BY_DOCUMENT_TYPE: Record<string, string[]> = {
  NDA: NDA_EXPECTED,
  MUTUAL_NDA: NDA_EXPECTED,
  SERVICE_AGREEMENT: MSA_EXPECTED,
  MSA: MSA_EXPECTED,
};

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  DEFINITIONS: "HIGH",
  CONFIDENTIALITY: "HIGH",
  EXCLUSIONS: "MEDIUM",
  TERM: "MEDIUM",
  SCOPE_OF_SERVICES: "HIGH",
  FEES: "HIGH",
  PAYMENT_TERMS: "MEDIUM",
  LIMITATION_OF_LIABILITY: "HIGH",
  TERMINATION: "MEDIUM",
  JURISDICTION: "LOW",
};

export const ndaMsaPack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "nda_msa",
  name: "NDA / Service Agreement",
  description:
    "Non-disclosure agreements (one-way and mutual) and service / master service agreements between businesses or individuals.",
  version: "2026.10.0",
  jurisdiction: { country: "IN", referenceVersion: "2026-10" },
  documentTypes: [
    { id: "NDA", slug: "nda", label: "Non-Disclosure Agreement" },
    { id: "MUTUAL_NDA", slug: "mutual_nda", label: "Mutual NDA" },
    { id: "SERVICE_AGREEMENT", slug: "service_agreement", label: "Service Agreement" },
    { id: "MSA", slug: "msa", label: "Master Service Agreement" },
  ],

  entitySchema: [
    { label: "DISCLOSING_PARTY", displayName: "Disclosing party", coreType: "PARTY" },
    { label: "RECEIVING_PARTY", displayName: "Receiving party", coreType: "PARTY" },
    { label: "CONTRACTING_PARTY", displayName: "Party (mutual NDA)", coreType: "PARTY" },
    { label: "PARTY_A", displayName: "Party A", coreType: "PARTY" },
    { label: "PARTY_B", displayName: "Party B", coreType: "PARTY" },
    { label: "CLIENT", displayName: "Client", coreType: "PARTY" },
    { label: "SERVICE_PROVIDER", displayName: "Service provider", coreType: "PARTY" },
    {
      label: "CONFIDENTIAL_INFORMATION",
      displayName: "Confidential information",
      coreType: "TEXT",
    },
    { label: "PURPOSE", displayName: "Purpose", coreType: "TEXT" },
    { label: "SERVICE", displayName: "Services", coreType: "TEXT" },
    { label: "DELIVERABLE", displayName: "Deliverable", coreType: "TEXT" },
    { label: "FEE", displayName: "Fee", coreType: "MONEY" },
    { label: "LIABILITY_CAP", displayName: "Liability cap", coreType: "MONEY" },
    { label: "LIABILITY_LIMIT", displayName: "Liability limit", coreType: "TEXT" },
    {
      label: "LIABILITY_EXCEPTION",
      displayName: "Exception to the liability limit",
      coreType: "TEXT",
    },
    { label: "UNCAPPED_INDEMNITY", displayName: "Indemnity without a limit", coreType: "TEXT" },
    { label: "RETURN_PERIOD", displayName: "Return or destruction deadline", coreType: "DURATION" },
    { label: "RETENTION_PERIOD", displayName: "Period copies may be kept", coreType: "DURATION" },
    { label: "PAYMENT_TERM", displayName: "Invoice payment term", coreType: "DURATION" },
    { label: "TERM", displayName: "Agreement term", coreType: "DURATION" },
    {
      label: "CONFIDENTIALITY_PERIOD",
      displayName: "Confidentiality period",
      coreType: "DURATION",
    },
    { label: "TERMINATION_NOTICE", displayName: "Termination notice", coreType: "DURATION" },
    { label: "WARRANTY_PERIOD", displayName: "Warranty period", coreType: "DURATION" },
    { label: "EFFECTIVE_DATE", displayName: "Effective date", coreType: "DATE" },
    { label: "INTELLECTUAL_PROPERTY", displayName: "Intellectual property", coreType: "TEXT" },
    { label: "DATA", displayName: "Data", coreType: "TEXT" },
    { label: "ADDRESS", displayName: "Place of execution", coreType: "LOCATION" },
    { label: "JURISDICTION", displayName: "Jurisdiction", coreType: "LOCATION" },
    { label: "WITNESS", displayName: "Witness", coreType: "PERSON" },
  ],
  partyTerms: {
    DISCLOSING_PARTY: ["Disclosing Party"],
    RECEIVING_PARTY: ["Receiving Party", "Recipient"],
    CONTRACTING_PARTY: ["First Party", "Second Party"],
    PARTY_A: ["Party A"],
    PARTY_B: ["Party B"],
    CLIENT: ["Client", "Customer"],
    SERVICE_PROVIDER: ["Service Provider", "Supplier", "Consultant", "Contractor"],
  },
  // "Is the indemnity capped?", "what limits liability" are about the liability picture,
  // which is a limit plus whatever sits outside it - never the limit alone.
  questionAliases: [
    {
      pattern: /\b(?:liabilit(?:y|ies)|indemnit(?:y|ies)|indemnif\w*)\b|\bcap(?:ped)?\b/i,
      label: "LIABILITY_LIMIT",
    },
  ],
  answerCompanions: {
    LIABILITY_LIMIT: ["LIABILITY_CAP", "LIABILITY_EXCEPTION", "UNCAPPED_INDEMNITY"],
  },
  // Shown on the workspace Overview card, in this order (first value of each).
  overviewFields: [
    "DISCLOSING_PARTY",
    "RECEIVING_PARTY",
    "CONTRACTING_PARTY",
    "PARTY_A",
    "PARTY_B",
    "CLIENT",
    "SERVICE_PROVIDER",
    "CONFIDENTIALITY_PERIOD",
    "TERM",
    "TERMINATION_NOTICE",
  ],
  extraction: NDA_MSA_EXTRACTION,

  clauseSchema: [
    { clauseType: "DEFINITIONS", headingPattern: /DEFINITION|INTERPRETATION/i, priority: 10 },
    { clauseType: "EXCLUSIONS", headingPattern: /EXCLUSION|EXCEPTION/i, priority: 20 },
    { clauseType: "RETURN_OF_INFORMATION", headingPattern: /RETURN|DESTRUCTION/i, priority: 30 },
    // "TERM AND SURVIVAL" states the agreement's term; "SURVIVAL" alone is
    // the confidentiality period.
    { clauseType: "TERM", headingPattern: /\bTERM\b.*SURVIV/i, priority: 34 },
    { clauseType: "CONFIDENTIALITY_PERIOD", headingPattern: /SURVIV/i, priority: 35 },
    {
      clauseType: "CONFIDENTIALITY",
      headingPattern: /CONFIDENTIAL|NON[\s-]?DISCLOSURE/i,
      priority: 40,
    },
    { clauseType: "PURPOSE", headingPattern: /PURPOSE/i, priority: 50 },
    { clauseType: "DELIVERABLES", headingPattern: /DELIVERABLE|MILESTONE/i, priority: 55 },
    { clauseType: "SCOPE_OF_SERVICES", headingPattern: /SCOPE|SERVICES/i, priority: 60 },
    { clauseType: "PAYMENT_TERMS", headingPattern: /PAYMENT|INVOIC/i, priority: 65 },
    {
      clauseType: "FEES",
      headingPattern: /\bFEES?\b|CONSIDERATION|PRICE|COMMERCIAL/i,
      priority: 70,
    },
    {
      clauseType: "INTELLECTUAL_PROPERTY",
      headingPattern: /INTELLECTUAL|OWNERSHIP\s+OF|\bIP\b/i,
      priority: 80,
    },
    { clauseType: "DATA_PROTECTION", headingPattern: /\bDATA\b|PRIVACY/i, priority: 90 },
    { clauseType: "WARRANTIES", headingPattern: /WARRANT/i, priority: 100 },
    { clauseType: "LIMITATION_OF_LIABILITY", headingPattern: /LIABILITY/i, priority: 110 },
    { clauseType: "INDEMNITY", headingPattern: /INDEMNI/i, priority: 120 },
    { clauseType: "NON_SOLICITATION", headingPattern: /SOLICIT/i, priority: 125 },
    { clauseType: "TERM", headingPattern: /\bTERM\b|DURATION|EFFECTIVE/i, priority: 130 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION/i, priority: 140 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE|ARBITRATION/i, priority: 150 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION|GOVERNING\s+LAW/i, priority: 160 },
  ],

  relationSchema: [
    {
      relationType: "DISCLOSES",
      subjectEntityLabel: "DISCLOSING_PARTY",
      objectEntityLabel: "CONFIDENTIAL_INFORMATION",
    },
    {
      relationType: "RECEIVES",
      subjectEntityLabel: "RECEIVING_PARTY",
      objectEntityLabel: "CONFIDENTIAL_INFORMATION",
    },
    {
      relationType: "PROTECTS",
      subjectEntityLabel: "RECEIVING_PARTY",
      objectEntityLabel: "CONFIDENTIAL_INFORMATION",
    },
    {
      relationType: "PROTECTS",
      subjectEntityLabel: "CONTRACTING_PARTY",
      objectEntityLabel: "CONFIDENTIAL_INFORMATION",
    },
    {
      relationType: "PROVIDES",
      subjectEntityLabel: "SERVICE_PROVIDER",
      objectEntityLabel: "SERVICE",
    },
    {
      relationType: "DELIVERS",
      subjectEntityLabel: "SERVICE_PROVIDER",
      objectEntityLabel: "DELIVERABLE",
    },
    { relationType: "PAYS", subjectEntityLabel: "CLIENT", objectEntityLabel: "FEE" },
    {
      relationType: "OWNS",
      subjectEntityLabel: "CLIENT",
      objectEntityLabel: "INTELLECTUAL_PROPERTY",
    },
    { relationType: "HAS_PURPOSE", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "PURPOSE" },
    { relationType: "HAS_TERM", subjectEntityLabel: "DOCUMENT", objectEntityLabel: "TERM" },
    {
      relationType: "CONFIDENTIAL_FOR",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "CONFIDENTIALITY_PERIOD",
    },
    {
      relationType: "HAS_TERMINATION_NOTICE",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "TERMINATION_NOTICE",
    },
    {
      relationType: "HAS_PAYMENT_TERM",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "PAYMENT_TERM",
    },
    {
      relationType: "HAS_LIABILITY_CAP",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "LIABILITY_CAP",
    },
    {
      relationType: "EFFECTIVE_FROM",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "EFFECTIVE_DATE",
    },
    {
      relationType: "HAS_JURISDICTION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "JURISDICTION",
    },
  ],

  obligationSchema: [
    {
      action: "PROTECT_CONFIDENTIAL",
      actorLabels: ["RECEIVING_PARTY", "CONTRACTING_PARTY", "SERVICE_PROVIDER", "CLIENT"],
      description: "Keep the other party's information confidential.",
    },
    {
      action: "RETURN_INFORMATION",
      actorLabels: ["RECEIVING_PARTY", "CONTRACTING_PARTY", "SERVICE_PROVIDER"],
      description: "Return or destroy confidential information.",
    },
    {
      action: "PROVIDE_SERVICES",
      actorLabels: ["SERVICE_PROVIDER"],
      description: "Perform the services / deliverables.",
    },
    { action: "PAY", actorLabels: ["CLIENT"], description: "Pay fees within the payment term." },
    {
      action: "INDEMNIFY",
      actorLabels: ["SERVICE_PROVIDER", "CLIENT"],
      description: "Indemnify the other party.",
    },
    {
      action: "NOTIFY_BREACH",
      actorLabels: ["SERVICE_PROVIDER", "RECEIVING_PARTY"],
      description: "Notify a data or confidentiality breach.",
    },
    {
      action: "SERVE_NOTICE",
      actorLabels: [
        "CLIENT",
        "SERVICE_PROVIDER",
        "DISCLOSING_PARTY",
        "RECEIVING_PARTY",
        "CONTRACTING_PARTY",
      ],
      description: "Give notice before terminating.",
    },
  ],

  riskSchema: {
    expectedClauseTypes: [...new Set(Object.values(EXPECTED_BY_DOCUMENT_TYPE).flat())],
    expectedClauseTypesByDocumentType: EXPECTED_BY_DOCUMENT_TYPE,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      uncappedLiabilityCheck,
      makeOneSidedRemedyCheck(["TERMINATION"]),
      makeMissingClauseCheckByDocumentType(EXPECTED_BY_DOCUMENT_TYPE, MISSING_CLAUSE_SEVERITY),
    ],
    comparisonChecks: [oneWayMutualConfidentialityCheck],
  },

  consistencyRules: [
    {
      id: "nda_conf_period_single",
      kind: "SINGLE_VALUE",
      label: "CONFIDENTIALITY_PERIOD",
      category: "DURATION_CONTRADICTION",
      description: "The confidentiality period should be stated consistently.",
    },
    {
      id: "nda_term_single",
      kind: "SINGLE_VALUE",
      label: "TERM",
      category: "DURATION_CONTRADICTION",
      description: "The agreement term should be stated consistently.",
    },
    {
      id: "nda_payment_term_single",
      kind: "SINGLE_VALUE",
      label: "PAYMENT_TERM",
      category: "DURATION_CONTRADICTION",
      description: "The invoice payment deadline should be stated consistently.",
    },
    {
      id: "nda_return_vs_retention",
      kind: "DURATION_AT_MOST",
      label: "RETENTION_PERIOD",
      limit: "RETURN_PERIOD",
      category: "DURATION_CONTRADICTION",
      description:
        "Copies may be kept for longer than the deadline to return or destroy information.",
    },
    {
      id: "nda_termination_notice_single",
      kind: "SINGLE_VALUE",
      label: "TERMINATION_NOTICE",
      category: "DURATION_CONTRADICTION",
      description: "The termination notice period should be stated consistently.",
    },
    {
      id: "msa_fee_single",
      kind: "SINGLE_VALUE",
      label: "FEE",
      category: "FINANCIAL_CONTRADICTION",
      description: "The fee should be stated consistently.",
    },
    {
      id: "msa_cap_single",
      kind: "SINGLE_VALUE",
      label: "LIABILITY_CAP",
      category: "FINANCIAL_CONTRADICTION",
      description: "The liability cap should be stated consistently.",
    },
    {
      id: "nda_discloser_single",
      kind: "SINGLE_VALUE",
      label: "DISCLOSING_PARTY",
      category: "PARTY_NAME_CONTRADICTION",
      description: "The disclosing party should be named consistently.",
    },
    {
      id: "nda_recipient_single",
      kind: "SINGLE_VALUE",
      label: "RECEIVING_PARTY",
      category: "PARTY_NAME_CONTRADICTION",
      description: "The receiving party should be named consistently.",
    },
    {
      id: "msa_client_single",
      kind: "SINGLE_VALUE",
      label: "CLIENT",
      category: "PARTY_NAME_CONTRADICTION",
      description: "The client should be named consistently.",
    },
    {
      id: "msa_provider_single",
      kind: "SINGLE_VALUE",
      label: "SERVICE_PROVIDER",
      category: "PARTY_NAME_CONTRADICTION",
      description: "The service provider should be named consistently.",
    },
    {
      id: "nda_definition_single",
      kind: "SINGLE_VALUE",
      label: "CONFIDENTIAL_INFORMATION",
      category: "DEFINITION_INCONSISTENCY",
      description: "Confidential Information should be defined once, consistently.",
    },
    {
      id: "msa_fee_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY",
      objectLabel: "FEE",
      expectedActor: "CLIENT",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "Fees are expected to be paid by the client.",
    },
  ],

  detection: {
    documentTypes: [
      { documentType: "MUTUAL_NDA", pattern: /\bMUTUAL\b/i },
      { documentType: "MSA", pattern: /\bMASTER\s+SERVICES?\b/i },
      { documentType: "SERVICE_AGREEMENT", pattern: /\bSERVICES?\s+AGREEMENT\b/i },
    ],
    titlePatterns: [
      /\bNON[\s-]?DISCLOSURE\s+AGREEMENT\b/i,
      /\bCONFIDENTIALITY\s+AGREEMENT\b/i,
      /\bMASTER\s+SERVICES?\s+AGREEMENT\b/i,
      /\b(?:PROFESSIONAL\s+|CONSULTING\s+)?SERVICES?\s+AGREEMENT\b/i,
    ],
    lexicalPatterns: [
      /\bconfidential\s+information\b/i,
      /\b(?:disclosing|receiving)\s+party\b/i,
      /\bservice\s+provider\b/i,
      /\bscope\s+of\s+(?:work|services)\b/i,
      /\binvoice\b/i,
      /\blimitation\s+of\s+liability\b/i,
    ],
  },

  legalFrameworks: [CONTRACT_ACT_S73_S74_DAMAGES, DPDP_ACT_2023, ARBITRATION_ACT_1996],
  generatorConfig: { module: "research/generator/v3/domains/nda_msa.py" },
};
