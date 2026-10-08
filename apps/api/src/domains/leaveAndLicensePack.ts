// The leave_and_license DomainPack (Phase 8). A licence grants permission
// to occupy premises without creating a tenancy - the distinction from a
// residential lease is carried by vocabulary (Licensor/Licensee, licence
// fee, "no tenancy is created") rather than by any code path, which is why
// this pack's detection signals and expected NO_TENANCY clause matter.
import {
  makeAsymmetricNoticeCheck,
  makeDiscretionCheck,
  makeLiabilityShiftCheck,
} from "../risk/factChecks.js";
import { LEAVE_AND_LICENSE_EXTRACTION } from "./extractionRules.js";
import type { DomainPack } from "./registry.js";
import { makeMissingClauseCheck } from "../risk/missingClauseCheck.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";
import {
  ARBITRATION_ACT_1996,
  EASEMENTS_ACT_S52_LICENCE,
  MAHARASHTRA_RENT_CONTROL_S55,
  REGISTRATION_ACT_S17,
} from "./legalReferences.js";

const EXPECTED_CLAUSE_TYPES = [
  "LICENSE_PERIOD",
  "LICENSE_FEE",
  "SECURITY_DEPOSIT",
  "NO_TENANCY",
  "TERMINATION",
  "JURISDICTION",
];

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  LICENSE_PERIOD: "HIGH",
  LICENSE_FEE: "HIGH",
  SECURITY_DEPOSIT: "MEDIUM",
  NO_TENANCY: "MEDIUM",
  TERMINATION: "HIGH",
  JURISDICTION: "MEDIUM",
};

export const leaveAndLicensePack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "leave_and_license",
  name: "Leave and License Agreement",
  description:
    "Permission to occupy residential premises for a fixed period against a licence fee, without creating a tenancy (common in Maharashtra).",
  version: "2026.10.0",
  jurisdiction: { country: "IN", referenceVersion: "2026-10" },
  documentTypes: [
    { id: "LEAVE_AND_LICENSE", slug: "leave_and_license", label: "Leave and License" },
  ],

  entitySchema: [
    { label: "LICENSOR", displayName: "Licensor", coreType: "PARTY" },
    { label: "LICENSEE", displayName: "Licensee", coreType: "PARTY" },
    { label: "LICENSED_PREMISES", displayName: "Licensed premises", coreType: "ADDRESS" },
    { label: "ADDRESS", displayName: "Place of execution", coreType: "LOCATION" },
    { label: "EXECUTION_DATE", displayName: "Execution date", coreType: "DATE" },
    { label: "COMMENCEMENT_DATE", displayName: "Commencement date", coreType: "DATE" },
    { label: "EXPIRY_DATE", displayName: "Expiry date", coreType: "DATE" },
    { label: "LICENSE_PERIOD", displayName: "Licence period", coreType: "DURATION" },
    { label: "LICENSE_FEE", displayName: "Licence fee", coreType: "MONEY" },
    { label: "SECURITY_DEPOSIT", displayName: "Security deposit", coreType: "MONEY" },
    { label: "NOTICE_PERIOD", displayName: "Notice period", coreType: "DURATION" },
    { label: "LOCK_IN_PERIOD", displayName: "Lock-in period", coreType: "DURATION" },
    { label: "ESCALATION_RATE", displayName: "Fee escalation (increase)", coreType: "PERCENT" },
    { label: "PERMITTED_USE", displayName: "Permitted use", coreType: "TEXT" },
    { label: "JURISDICTION", displayName: "Jurisdiction", coreType: "LOCATION" },
    { label: "WITNESS", displayName: "Witness", coreType: "PERSON" },
  ],
  partyTerms: { LICENSOR: ["Licensor"], LICENSEE: ["Licensee"] },
  // Shown on the workspace Overview card, in this order (first value of each).
  overviewFields: [
    "LICENSOR",
    "LICENSEE",
    "LICENSED_PREMISES",
    "LICENSE_FEE",
    "SECURITY_DEPOSIT",
    "LICENSE_PERIOD",
    "NOTICE_PERIOD",
  ],
  extraction: LEAVE_AND_LICENSE_EXTRACTION,

  clauseSchema: [
    {
      clauseType: "ESCALATION",
      headingPattern: /ESCALATION|ENHANCEMENT|REVISION|INCREASE/i,
      priority: 5,
    },
    { clauseType: "LICENSE_FEE", headingPattern: /LICEN[CS]E\s+FEE|COMPENSATION/i, priority: 10 },
    { clauseType: "SECURITY_DEPOSIT", headingPattern: /DEPOSIT/i, priority: 20 },
    { clauseType: "LOCK_IN_PERIOD", headingPattern: /LOCK.?IN/i, priority: 30 },
    { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i, priority: 40 },
    {
      clauseType: "LICENSE_PERIOD",
      headingPattern: /PERIOD|DURATION|TERM\s+OF\s+(?:THE\s+)?LICEN/i,
      priority: 50,
    },
    { clauseType: "RENEWAL", headingPattern: /RENEW/i, priority: 60 },
    { clauseType: "POSSESSION", headingPattern: /POSSESSION|HANDOVER|HAND\s+OVER/i, priority: 70 },
    { clauseType: "MAINTENANCE", headingPattern: /MAINTENANCE|REPAIR/i, priority: 80 },
    {
      clauseType: "UTILITIES",
      headingPattern: /UTILIT|ELECTRICITY|OUTGOINGS|CHARGES/i,
      priority: 90,
    },
    { clauseType: "PERMITTED_USE", headingPattern: /\bUSE\b|PURPOSE/i, priority: 100 },
    { clauseType: "NO_TENANCY", headingPattern: /TENANCY|NATURE\s+OF/i, priority: 110 },
    { clauseType: "REGISTRATION", headingPattern: /REGISTRATION|STAMP/i, priority: 120 },
    { clauseType: "TERMINATION", headingPattern: /TERMINATION|REVOCATION/i, priority: 130 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE|ARBITRATION/i, priority: 140 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION|GOVERNING\s+LAW/i, priority: 150 },
  ],

  relationSchema: [
    {
      relationType: "LICENSOR_OF",
      subjectEntityLabel: "LICENSOR",
      objectEntityLabel: "LICENSED_PREMISES",
    },
    { relationType: "LICENSES", subjectEntityLabel: "LICENSOR", objectEntityLabel: "LICENSEE" },
    {
      relationType: "OCCUPIES",
      subjectEntityLabel: "LICENSEE",
      objectEntityLabel: "LICENSED_PREMISES",
    },
    { relationType: "MUST_PAY", subjectEntityLabel: "LICENSEE", objectEntityLabel: "LICENSE_FEE" },
    {
      relationType: "MUST_PAY",
      subjectEntityLabel: "LICENSEE",
      objectEntityLabel: "SECURITY_DEPOSIT",
    },
    {
      relationType: "HAS_TERM",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "LICENSE_PERIOD",
    },
    {
      relationType: "HAS_NOTICE_PERIOD",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "NOTICE_PERIOD",
    },
    {
      relationType: "HAS_LOCK_IN",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "LOCK_IN_PERIOD",
    },
    {
      relationType: "STARTS_ON",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "COMMENCEMENT_DATE",
    },
    {
      relationType: "TERMINATES_ON",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "EXPIRY_DATE",
    },
    {
      relationType: "USED_FOR",
      subjectEntityLabel: "LICENSED_PREMISES",
      objectEntityLabel: "PERMITTED_USE",
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
      actorLabels: ["LICENSEE"],
      description: "Pay the licence fee, deposit or charges.",
    },
    {
      action: "REFUND_DEPOSIT",
      actorLabels: ["LICENSOR"],
      description: "Return the security deposit.",
    },
    {
      action: "MAINTAIN",
      actorLabels: ["LICENSEE", "LICENSOR"],
      description: "Carry out repairs or upkeep.",
    },
    {
      action: "SERVE_NOTICE",
      actorLabels: ["LICENSEE", "LICENSOR"],
      description: "Give notice before terminating.",
    },
    {
      action: "VACATE",
      actorLabels: ["LICENSEE"],
      description: "Hand back the premises at the end of the licence.",
    },
    {
      action: "REGISTER",
      actorLabels: ["LICENSOR", "LICENSEE"],
      description: "Have the agreement registered.",
    },
  ],

  riskSchema: {
    expectedClauseTypes: EXPECTED_CLAUSE_TYPES,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      makeDiscretionCheck(["SECURITY_DEPOSIT"]),
      makeLiabilityShiftCheck("MAINTENANCE", ["Licensee"]),
      makeMissingClauseCheck(EXPECTED_CLAUSE_TYPES, MISSING_CLAUSE_SEVERITY),
    ],
    comparisonChecks: [
      makeAsymmetricNoticeCheck(["NOTICE_PERIOD"], {
        LICENSOR: ["Licensor"],
        LICENSEE: ["Licensee"],
      }),
    ],
  },

  consistencyRules: [
    {
      id: "ll_fee_single",
      kind: "SINGLE_VALUE",
      label: "LICENSE_FEE",
      category: "FINANCIAL_CONTRADICTION",
      description: "The licence fee should be stated consistently.",
    },
    {
      id: "ll_deposit_single",
      kind: "SINGLE_VALUE",
      label: "SECURITY_DEPOSIT",
      category: "FINANCIAL_CONTRADICTION",
      description: "The security deposit should be stated consistently.",
    },
    {
      id: "ll_period_single",
      kind: "SINGLE_VALUE",
      label: "LICENSE_PERIOD",
      category: "DURATION_CONTRADICTION",
      description: "The licence period should be stated consistently.",
    },
    {
      id: "ll_notice_single",
      kind: "SINGLE_VALUE",
      label: "NOTICE_PERIOD",
      category: "DURATION_CONTRADICTION",
      description: "A party's notice period should be stated consistently.",
    },
    {
      id: "ll_start_single",
      kind: "SINGLE_VALUE",
      label: "COMMENCEMENT_DATE",
      category: "DATE_CONTRADICTION",
      description: "The commencement date should be stated consistently.",
    },
    {
      id: "ll_start_before_end",
      kind: "DATE_ORDER",
      before: "COMMENCEMENT_DATE",
      after: "EXPIRY_DATE",
      category: "DATE_CONTRADICTION",
      description: "The licence should not expire before it starts.",
    },
    {
      id: "ll_fee_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY",
      objectLabel: "LICENSE_FEE",
      expectedActor: "LICENSEE",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "The licence fee is expected to be paid by the Licensee.",
    },
  ],

  detection: {
    titlePatterns: [/\bLEAVE\s+AND\s+LICEN[CS]E\b/i, /\bLICEN[CS]E\s+AGREEMENT\b/i],
    lexicalPatterns: [
      /\bleave\s+and\s+licen[cs]e\b/i,
      /\blicensor\b/i,
      /\blicensee\b/i,
      /\blicen[cs]e\s+fee\b/i,
      /\bnot\s+(?:create|be\s+construed\s+as)\s+(?:a\s+|any\s+)?tenancy\b/i,
    ],
  },

  legalFrameworks: [
    EASEMENTS_ACT_S52_LICENCE,
    MAHARASHTRA_RENT_CONTROL_S55,
    REGISTRATION_ACT_S17,
    ARBITRATION_ACT_1996,
  ],
  generatorConfig: { module: "research/generator/v3/domains/leave_and_license.py" },
};
