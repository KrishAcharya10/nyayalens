// The employment DomainPack (Phase 8): employment contracts, offer
// letters and appointment letters. Offer letters address the employee as
// "you", so "you" is a party term for EMPLOYEE - obligation extraction
// resolves "You shall serve..." to the employee.
import { makeAsymmetricNoticeCheck, restrictiveCovenantCheck } from "../risk/factChecks.js";
import { EMPLOYMENT_EXTRACTION } from "./extractionRules.js";
import type { DomainPack } from "./registry.js";
import { makeMissingClauseCheckByDocumentType } from "../risk/missingClauseCheck.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";
import { ARBITRATION_ACT_1996, CONTRACT_ACT_S27_RESTRAINT } from "./legalReferences.js";

const EXPECTED_BY_DOCUMENT_TYPE: Record<string, string[]> = {
  EMPLOYMENT_CONTRACT: [
    "POSITION",
    "COMMENCEMENT",
    "COMPENSATION",
    "PROBATION",
    "NOTICE_PERIOD",
    "CONFIDENTIALITY",
    "INTELLECTUAL_PROPERTY",
    "JURISDICTION",
  ],
  APPOINTMENT_LETTER: ["POSITION", "COMMENCEMENT", "COMPENSATION", "PROBATION", "NOTICE_PERIOD"],
  OFFER_LETTER: ["POSITION", "COMMENCEMENT", "COMPENSATION"],
};

const MISSING_CLAUSE_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  POSITION: "MEDIUM",
  COMMENCEMENT: "MEDIUM",
  COMPENSATION: "HIGH",
  PROBATION: "LOW",
  NOTICE_PERIOD: "MEDIUM",
  CONFIDENTIALITY: "MEDIUM",
  INTELLECTUAL_PROPERTY: "MEDIUM",
  JURISDICTION: "LOW",
};

export const employmentPack: DomainPack<RiskEngineContext, RiskFinding> = {
  id: "employment",
  name: "Employment",
  description:
    "Employment contracts, offer letters and appointment letters between an employer and an employee.",
  version: "2026.10.0",
  jurisdiction: { country: "IN", referenceVersion: "2026-10" },
  documentTypes: [
    { id: "EMPLOYMENT_CONTRACT", slug: "employment_contract", label: "Employment Contract" },
    { id: "OFFER_LETTER", slug: "offer_letter", label: "Offer Letter" },
    { id: "APPOINTMENT_LETTER", slug: "appointment_letter", label: "Appointment Letter" },
  ],

  entitySchema: [
    { label: "EMPLOYER", displayName: "Employer", coreType: "PARTY" },
    { label: "EMPLOYEE", displayName: "Employee", coreType: "PARTY" },
    { label: "JOB_TITLE", displayName: "Job title", coreType: "TEXT" },
    { label: "CTC", displayName: "Annual CTC", coreType: "MONEY" },
    { label: "SALARY", displayName: "Monthly gross salary", coreType: "MONEY" },
    { label: "BASE_SALARY", displayName: "Basic salary", coreType: "MONEY" },
    { label: "BONUS", displayName: "Bonus", coreType: "MONEY" },
    { label: "BONUS_PERCENT", displayName: "Bonus (percent of CTC)", coreType: "PERCENT" },
    { label: "HRA", displayName: "House rent allowance", coreType: "MONEY" },
    { label: "SPECIAL_ALLOWANCE", displayName: "Special allowance", coreType: "MONEY" },
    { label: "JOINING_DATE", displayName: "Joining date", coreType: "DATE" },
    { label: "EXECUTION_DATE", displayName: "Letter / agreement date", coreType: "DATE" },
    { label: "EXPIRY_DATE", displayName: "End of fixed term", coreType: "DATE" },
    { label: "PROBATION_PERIOD", displayName: "Probation period", coreType: "DURATION" },
    { label: "NOTICE_PERIOD", displayName: "Notice period", coreType: "DURATION" },
    { label: "NON_COMPETE_PERIOD", displayName: "Non-compete period", coreType: "DURATION" },
    { label: "LEAVE_ENTITLEMENT", displayName: "Leave entitlement", coreType: "DURATION" },
    { label: "WORK_LOCATION", displayName: "Work location", coreType: "LOCATION" },
    { label: "WORKING_HOURS", displayName: "Working hours", coreType: "TEXT" },
    {
      label: "CONFIDENTIAL_INFORMATION",
      displayName: "Confidential information",
      coreType: "TEXT",
    },
    { label: "INTELLECTUAL_PROPERTY", displayName: "Intellectual property", coreType: "TEXT" },
    { label: "BENEFITS", displayName: "Benefits", coreType: "TEXT" },
    { label: "JURISDICTION", displayName: "Jurisdiction", coreType: "LOCATION" },
  ],
  partyTerms: {
    EMPLOYER: ["Company", "Employer"],
    EMPLOYEE: ["Employee", "you"],
  },
  // Shown on the workspace Overview card, in this order (first value of each).
  overviewFields: [
    "EMPLOYEE",
    "EMPLOYER",
    "JOB_TITLE",
    "CTC",
    "SALARY",
    "JOINING_DATE",
    "NOTICE_PERIOD",
  ],
  extraction: EMPLOYMENT_EXTRACTION,

  clauseSchema: [
    {
      clauseType: "COMPENSATION",
      headingPattern: /COMPENSATION|REMUNERATION|SALARY|\bCTC\b|EMOLUMENTS/i,
      priority: 10,
    },
    { clauseType: "PROBATION", headingPattern: /PROBATION/i, priority: 20 },
    { clauseType: "NOTICE_PERIOD", headingPattern: /NOTICE/i, priority: 30 },
    {
      clauseType: "NON_COMPETE",
      headingPattern: /NON[\s-]?COMPET|NON[\s-]?SOLICIT|RESTRICTIVE/i,
      priority: 40,
    },
    { clauseType: "CONFIDENTIALITY", headingPattern: /CONFIDENTIAL/i, priority: 50 },
    {
      clauseType: "INTELLECTUAL_PROPERTY",
      headingPattern: /INTELLECTUAL|INVENTION|\bIP\b/i,
      priority: 60,
    },
    {
      clauseType: "WORKING_HOURS",
      headingPattern: /WORKING\s+HOURS|HOURS\s+OF\s+WORK/i,
      priority: 70,
    },
    { clauseType: "LEAVE", headingPattern: /LEAVE|HOLIDAY/i, priority: 80 },
    { clauseType: "BENEFITS", headingPattern: /BENEFIT|INSURANCE/i, priority: 90 },
    {
      clauseType: "POSITION",
      headingPattern: /POSITION|DESIGNATION|APPOINTMENT|\bROLE\b/i,
      priority: 100,
    },
    {
      clauseType: "COMMENCEMENT",
      headingPattern: /COMMENCEMENT|JOINING|DATE\s+OF/i,
      priority: 110,
    },
    {
      clauseType: "PLACE_OF_WORK",
      headingPattern: /PLACE\s+OF\s+WORK|LOCATION|TRANSFER/i,
      priority: 115,
    },
    {
      clauseType: "TERMINATION",
      headingPattern: /TERMINATION|SEPARATION|CESSATION/i,
      priority: 120,
    },
    { clauseType: "CODE_OF_CONDUCT", headingPattern: /CONDUCT|POLICIES/i, priority: 130 },
    { clauseType: "DISPUTE_RESOLUTION", headingPattern: /DISPUTE|ARBITRATION/i, priority: 140 },
    { clauseType: "JURISDICTION", headingPattern: /JURISDICTION|GOVERNING\s+LAW/i, priority: 150 },
  ],

  relationSchema: [
    { relationType: "EMPLOYED_BY", subjectEntityLabel: "EMPLOYEE", objectEntityLabel: "EMPLOYER" },
    { relationType: "HAS_ROLE", subjectEntityLabel: "EMPLOYEE", objectEntityLabel: "JOB_TITLE" },
    { relationType: "RECEIVES_SALARY", subjectEntityLabel: "EMPLOYEE", objectEntityLabel: "CTC" },
    {
      relationType: "RECEIVES_SALARY",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "SALARY",
    },
    {
      relationType: "RECEIVES_SALARY",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "BASE_SALARY",
    },
    { relationType: "RECEIVES_BONUS", subjectEntityLabel: "EMPLOYEE", objectEntityLabel: "BONUS" },
    {
      relationType: "STARTS_ON",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "JOINING_DATE",
    },
    {
      relationType: "HAS_PROBATION",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "PROBATION_PERIOD",
    },
    {
      relationType: "HAS_NOTICE_PERIOD",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "NOTICE_PERIOD",
    },
    {
      relationType: "HAS_LEAVE",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "LEAVE_ENTITLEMENT",
    },
    {
      relationType: "WORKS_AT",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "WORK_LOCATION",
    },
    {
      relationType: "OWNS_IP",
      subjectEntityLabel: "EMPLOYER",
      objectEntityLabel: "INTELLECTUAL_PROPERTY",
    },
    {
      relationType: "MUST_PROTECT",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "CONFIDENTIAL_INFORMATION",
    },
    {
      relationType: "RESTRICTED_FOR",
      subjectEntityLabel: "EMPLOYEE",
      objectEntityLabel: "NON_COMPETE_PERIOD",
    },
    {
      relationType: "TERMINATES_ON",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "EXPIRY_DATE",
    },
    {
      relationType: "HAS_JURISDICTION",
      subjectEntityLabel: "DOCUMENT",
      objectEntityLabel: "JURISDICTION",
    },
  ],

  obligationSchema: [
    {
      action: "PAY_SALARY",
      actorLabels: ["EMPLOYER"],
      description: "Pay salary and agreed compensation.",
    },
    {
      action: "SERVE_NOTICE",
      actorLabels: ["EMPLOYEE", "EMPLOYER"],
      description: "Give notice before ending employment.",
    },
    {
      action: "PROTECT_CONFIDENTIAL",
      actorLabels: ["EMPLOYEE"],
      description: "Keep the employer's information confidential.",
    },
    {
      action: "ASSIGN_IP",
      actorLabels: ["EMPLOYEE"],
      description: "Assign work product and inventions to the employer.",
    },
    {
      action: "JOIN",
      actorLabels: ["EMPLOYEE"],
      description: "Report for duty by the joining date.",
    },
    {
      action: "RETURN_PROPERTY",
      actorLabels: ["EMPLOYEE"],
      description: "Return company property on exit.",
    },
    {
      action: "REFRAIN_FROM_COMPETING",
      actorLabels: ["EMPLOYEE"],
      description: "Not compete or solicit for a period.",
    },
  ],

  riskSchema: {
    expectedClauseTypes: [...new Set(Object.values(EXPECTED_BY_DOCUMENT_TYPE).flat())],
    expectedClauseTypesByDocumentType: EXPECTED_BY_DOCUMENT_TYPE,
    missingClauseSeverity: MISSING_CLAUSE_SEVERITY,
    perClauseChecks: [
      restrictiveCovenantCheck,
      makeMissingClauseCheckByDocumentType(EXPECTED_BY_DOCUMENT_TYPE, MISSING_CLAUSE_SEVERITY),
    ],
    comparisonChecks: [
      makeAsymmetricNoticeCheck(["NOTICE_PERIOD"], {
        EMPLOYER: ["Company", "Employer"],
        EMPLOYEE: ["Employee", "you"],
      }),
    ],
  },

  consistencyRules: [
    {
      id: "emp_ctc_single",
      kind: "SINGLE_VALUE",
      label: "CTC",
      category: "FINANCIAL_CONTRADICTION",
      description: "The annual CTC should be stated consistently.",
    },
    {
      id: "emp_bonus_percent_single",
      kind: "SINGLE_VALUE",
      label: "BONUS_PERCENT",
      category: "FINANCIAL_CONTRADICTION",
      description: "The bonus percentage should be stated consistently.",
    },
    {
      id: "emp_ctc_components_monthly",
      kind: "SUM",
      parts: ["BASE_SALARY", "HRA", "SPECIAL_ALLOWANCE"],
      total: "CTC",
      partsMultiplier: 12,
      partsPeriodCue: /^\s*(?:per month|monthly|a month|p\.m\.?|\/month)/i,
      completenessCue:
        /made up of|comprises?|comprising|consists? of|composed of|broken down|split as/i,
      category: "PAYMENT_TOTAL_MISMATCH",
      description: "The CTC components, taken per month, should add up to the stated annual CTC.",
    },
    {
      id: "emp_ctc_components_annual",
      kind: "SUM",
      parts: ["BASE_SALARY", "HRA", "SPECIAL_ALLOWANCE"],
      total: "CTC",
      partsMultiplier: 1,
      partsPeriodCue: /^\s*(?:per annum|annually|per year|p\.a\.?|\/annum)/i,
      completenessCue:
        /made up of|comprises?|comprising|consists? of|composed of|broken down|split as/i,
      category: "PAYMENT_TOTAL_MISMATCH",
      description: "The CTC components, taken per year, should add up to the stated annual CTC.",
    },
    {
      id: "emp_salary_single",
      kind: "SINGLE_VALUE",
      label: "SALARY",
      category: "FINANCIAL_CONTRADICTION",
      description: "The monthly salary should be stated consistently.",
    },
    {
      id: "emp_notice_single",
      kind: "SINGLE_VALUE",
      label: "NOTICE_PERIOD",
      category: "DURATION_CONTRADICTION",
      description: "A party's notice period should be stated consistently.",
    },
    {
      id: "emp_probation_single",
      kind: "SINGLE_VALUE",
      label: "PROBATION_PERIOD",
      category: "DURATION_CONTRADICTION",
      description: "The probation period should be stated consistently.",
    },
    {
      id: "emp_joining_single",
      kind: "SINGLE_VALUE",
      label: "JOINING_DATE",
      category: "DATE_CONTRADICTION",
      description: "The joining date should be stated consistently.",
    },
    {
      id: "emp_joining_after_letter",
      kind: "DATE_ORDER",
      before: "EXECUTION_DATE",
      after: "JOINING_DATE",
      category: "DATE_CONTRADICTION",
      description: "The joining date should not precede the letter / agreement date.",
    },
    {
      id: "emp_salary_payer",
      kind: "EXPECTED_ACTOR",
      action: "PAY_SALARY",
      objectLabel: "SALARY",
      expectedActor: "EMPLOYER",
      category: "PARTY_ROLE_INCONSISTENCY",
      description: "Salary is expected to be paid by the employer.",
    },
  ],

  detection: {
    documentTypes: [
      { documentType: "OFFER_LETTER", pattern: /\bOffer\b/i },
      { documentType: "APPOINTMENT_LETTER", pattern: /\bAppointment\b/i },
    ],
    titlePatterns: [
      /\bEMPLOYMENT\s+(?:AGREEMENT|CONTRACT)\b/i,
      /\bOFFER\s+(?:OF\s+EMPLOYMENT|LETTER)\b/i,
      /\bAPPOINTMENT\s+LETTER\b/i,
      /\bLETTER\s+OF\s+APPOINTMENT\b/i,
    ],
    lexicalPatterns: [
      /\bemployee\b/i,
      /\bemployer\b/i,
      /\bcost\s+to\s+(?:the\s+)?company\b|\bCTC\b/i,
      /\bprobation\b/i,
      /\bdesignation\b/i,
      /\bjoining\b/i,
    ],
  },

  legalFrameworks: [CONTRACT_ACT_S27_RESTRAINT, ARBITRATION_ACT_1996],
  generatorConfig: { module: "research/generator/v3/domains/employment.py" },
};
