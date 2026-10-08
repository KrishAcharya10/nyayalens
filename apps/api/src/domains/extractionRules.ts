// Pack-driven extraction rules (data for ner/packNer.ts), one block per
// domain. Value rules are tried in order and an `after` match wins over
// `before` matches, so more specific contexts come first (e.g. "balance"
// before "consideration": "the balance consideration of Rs. X" is a balance).
//
// Grounded in the surface forms the synthetic generators produce, like the
// original Phase 4A patterns - a transparent baseline. Held-out templates in
// the v3 test split measure how far these rules generalise; real documents
// will phrase things in ways no rule here anticipates.
import type { PackExtraction, PhrasePattern, ValueRule } from "./registry.js";

// --- shared ---------------------------------------------------------------------

const PLACE_OF_EXECUTION: PhrasePattern = {
  label: "ADDRESS",
  regex: /(?:[Ee]xecuted at|made at)\s+([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s+on\b/g,
};

const JURISDICTION: PhrasePattern = {
  label: "JURISDICTION",
  regex: /courts at ([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)(?=\s+(?:alone|shall)|,)/g,
};

function instrumentDate(label: string): ValueRule {
  return {
    label,
    type: "DATE",
    before: /(?:executed at|made at)[\s\S]{0,40}?\son(?:\s+(?:this|the))?\s*$/i,
  };
}

const NOTICE_AFTER = /^'?s?\s+(?:prior\s+)?(?:written\s+)?notice/;

// --- residential rental (only labels the legacy v1 patterns never produce,
// plus NOTICE_PERIOD phrasings they miss) ------------------------------------------

export const RENTAL_EXTRACTION: PackExtraction = {
  phrasePatterns: [
    {
      label: "PROPERTY_ADDRESS",
      regex:
        /(?:premises situated at|flat bearing|premises at)\s+([\s\S]+?)\s+\((?:hereinafter )?["“]?the Premises/g,
    },
    PLACE_OF_EXECUTION,
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("EXECUTION_DATE"),
    { label: "EXPIRY_DATE", type: "DATE", before: /(?:ending(?: on)?|expire on|\bto)\s*$/ },
    {
      label: "COMMENCEMENT_DATE",
      type: "DATE",
      before: /(?:commencing from|with effect from|starting|from)\s*$/,
    },
    {
      label: "ESCALATION_RATE",
      type: "PERCENT",
      before: /(?:increased|enhanced|revised upward) by\s*$/,
    },
    // Specific durations before the generic "period of" rule below.
    { label: "LOCK_IN_PERIOD", type: "DURATION", before: /lock-in period of\s*$|first\s*$/ },
    {
      label: "NOTICE_PERIOD",
      type: "DURATION",
      after: NOTICE_AFTER,
      before: /notice (?:period )?of\s*$|not less than\s*$/,
    },
    {
      label: "DURATION",
      type: "DURATION",
      before: /(?:period of|term of)\s*$/,
      after: /^\s+(?:tenancy|lease)\b/,
    },
  ],
};

// --- land lease (new labels + survey prefixes other than "Survey No.") -------------

export const LAND_LEASE_EXTRACTION: PackExtraction = {
  phrasePatterns: [
    {
      label: "SURVEY_NUMBER",
      regex:
        /(?<!towards the (?:North|South|East|West): land bearing )(?:Sy\.|S\.F\.|Gat|Khasra|Block|Dag|Plot|Re-Survey|Gata)\s+No\.\s*([\dA-Z]+(?:\/[\dA-Z]+)*)/g,
    },
    {
      label: "LAND_USE_RESTRICTION",
      regex:
        /(?:solely for|exclusively for|leased for)\s+(?:the purpose of\s+)?([a-z][a-z ]+?)(?=\s+and for no other|;|,|\.)/g,
    },
    PLACE_OF_EXECUTION,
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("EXECUTION_DATE"),
    { label: "DURATION", type: "DURATION", before: /term of\s*$/ },
    { label: "EXPIRY_DATE", type: "DATE", before: /expiring on\s*$/ },
    {
      label: "COMMENCEMENT_DATE",
      type: "DATE",
      before: /(?:commencing on|with effect from|from)\s*$/,
    },
    { label: "ESCALATION_RATE", type: "PERCENT", before: /enhanced by\s*$|revised by\s*$/ },
    { label: "LAND_AREA", type: "AREA", before: /admeasuring\s*$/ },
    { label: "NOTICE_PERIOD", type: "DURATION", after: NOTICE_AFTER, before: /not less than\s*$/ },
  ],
};

// --- leave and license ----------------------------------------------------------------

export const LEAVE_AND_LICENSE_EXTRACTION: PackExtraction = {
  legacyPatterns: false,
  phrasePatterns: [
    PLACE_OF_EXECUTION,
    {
      label: "LICENSED_PREMISES",
      regex:
        /(?:premises situated at|occupy the premises at|being the owner of)\s+([\s\S]+?)\s+\((?:hereinafter )?["“]?the Licensed Premises/g,
    },
    {
      label: "PERMITTED_USE",
      regex:
        /\bfor\s+((?:residential|residence)[^;\n]*?)(?=;|, on the terms| on leave and license basis)/g,
    },
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("EXECUTION_DATE"),
    { label: "EXPIRY_DATE", type: "DATE", before: /(?:ending on|expire on|\bto)\s*$/ },
    {
      label: "COMMENCEMENT_DATE",
      type: "DATE",
      before: /(?:commencing from|with effect from|from)\s*$/,
    },
    { label: "SECURITY_DEPOSIT", type: "MONEY", before: /deposit of\s*$/ },
    {
      label: "LICENSE_FEE",
      type: "MONEY",
      before: /licen[cs]e fee of\s*$|fee of\s*$|sum of\s*$|pay\s*$/,
    },
    { label: "ESCALATION_RATE", type: "PERCENT", before: /increased by\s*$/ },
    { label: "LOCK_IN_PERIOD", type: "DURATION", before: /lock-in period of\s*$/ },
    { label: "NOTICE_PERIOD", type: "DURATION", after: NOTICE_AFTER, before: /notice of\s*$/ },
    {
      label: "LICENSE_PERIOD",
      type: "DURATION",
      before: /(?:period of|for|this)\s*$/,
      after: /^\s+licen[cs]e\b/,
    },
  ],
};

// --- sale / property --------------------------------------------------------------------

export const SALE_PROPERTY_EXTRACTION: PackExtraction = {
  legacyPatterns: false,
  phrasePatterns: [
    PLACE_OF_EXECUTION,
    {
      label: "POWER_OF_ATTORNEY",
      regex: /represented in this \w+ by (?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.)\s+([^,\n]+),/g,
    },
    {
      label: "PROPERTY",
      regex:
        /(?:absolute owner of the|acquired the|entitled to the)\s+(residential flat|residential plot of land|agricultural land)/g,
    },
    {
      label: "TITLE",
      regex:
        /(?:by virtue of|acquired the same by|\) by(?! virtue))\s+([\s\S]+?)(?=;|, and (?:is|has))/g,
    },
    { label: "FLAT_NUMBER", regex: /being\s+Flat No\.\s*(\d+)/g },
    { label: "PLOT_NUMBER", regex: /being\s+Plot No\.\s*(\d+)/g },
    { label: "CTS_NUMBER", regex: /CTS No\.\s*([\d/]+)/g },
    {
      label: "SURVEY_NUMBER",
      regex:
        /(?<!towards the (?:North|South|East|West): )(?:Survey|Sy\.|S\.F\.|Gat|Khasra|Block|Dag|Re-Survey|Gata)\s+No\.\s*([\dA-Z]+(?:\/[\dA-Z]+)*)/g,
    },
    { label: "KHATA_NUMBER", regex: /Khata No\.\s*([\w/-]+)/g },
    { label: "PROPERTY_ADDRESS", regex: /situated at ([^\n]{5,160}?)\.\n/g },
    {
      label: "BOUNDARY",
      regex: /On or towards the (?:North|South|East|West): ([^\n]+)/g,
      lines: true,
    },
    { label: "ENCUMBRANCE", regex: /subject to (an equitable mortgage)/g },
    {
      label: "BANK",
      regex: /in favour of ([A-Z][A-Za-z ]+?(?:Limited|of India|of Baroda))/g,
    },
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("AGREEMENT_DATE"),
    { label: "POSSESSION_DATE", type: "DATE", before: /possession|occupy/ },
    {
      label: "REGISTRATION_DATE",
      type: "DATE",
      before: /balance|remaining/,
      after: /^[^.]{0,40}?\b(?:remaining|balance)\b/,
    },
    {
      label: "ADVANCE_AMOUNT",
      type: "MONEY",
      after: /^[^.;]{0,40}?\b(?:as|towards) (?:advance|earnest money)/,
      before: /advance|earnest|token/,
    },
    {
      label: "BALANCE_AMOUNT",
      type: "MONEY",
      after: /^\s*towards the balance/,
      before: /balance|remaining/,
    },
    { label: "REGISTRATION_FEE", type: "MONEY", before: /registration (?:fee|charges)/ },
    { label: "STAMP_DUTY", type: "MONEY", before: /stamp duty/ },
    { label: "LOAN", type: "MONEY", before: /outstanding amount|loan/ },
    { label: "SALE_CONSIDERATION", type: "MONEY", before: /consideration|price/ },
    { label: "BUILT_UP_AREA", type: "AREA", after: /^\s*built-up area/ },
    { label: "CARPET_AREA", type: "AREA", before: /admeasuring\s*$/, requires: /residential flat/ },
    {
      label: "LAND_AREA",
      type: "AREA",
      before: /admeasuring\s*$/,
      requires: /plot of land|agricultural land/,
    },
  ],
};

// --- builder-buyer ------------------------------------------------------------------------

export const BUILDER_BUYER_EXTRACTION: PackExtraction = {
  legacyPatterns: false,
  phrasePatterns: [
    PLACE_OF_EXECUTION,
    { label: "PROJECT", regex: /project (?:known as )?([A-Z][a-z]+ [A-Z][a-z]+)(?= on land| at)/g },
    {
      label: "PROJECT_ADDRESS",
      regex:
        /(?:on land situated at|project [A-Z][a-z]+ [A-Z][a-z]+ at)\s+([\s\S]+?)(?=, registered|\. The project)/g,
    },
    { label: "REGISTRATION_REFERENCE", regex: /registration no\.\s*(P\d{11})/g },
    { label: "UNIT", regex: /Apartment (?:No\. )?([A-F]-\d{3,5})/g },
    {
      label: "PAYMENT_PLAN",
      regex:
        /under an? ((?:construction|time)-linked payment plan|down payment plan with construction-linked balance)/g,
    },
    { label: "CONSTRUCTION_STATUS", regex: /construction status as on date is ([^.]+)\./g },
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("EXECUTION_DATE"),
    { label: "POSSESSION_DATE", type: "DATE", before: /possession|expected by/ },
    { label: "BOOKING_AMOUNT", type: "MONEY", before: /booking amount/ },
    { label: "MAINTENANCE_CHARGE", type: "MONEY", before: /maintenance charges/ },
    {
      label: "INSTALMENT_AMOUNT",
      type: "MONEY",
      before: /\bOn\s+(?:completion|casting|receipt)\b/,
    },
    { label: "SALE_CONSIDERATION", type: "MONEY", before: /total price|consideration|price/ },
    { label: "CARPET_AREA", type: "AREA", before: /carpet area(?: of)?\s*$/ },
    { label: "GRACE_PERIOD", type: "DURATION", before: /grace period of\s*$/ },
    { label: "DEFECT_LIABILITY_PERIOD", type: "DURATION", before: /notice of the \w+ within\s*$/ },
    { label: "REFUND_PERIOD", type: "DURATION", before: /refund[\s\S]*within\s*$/ },
    { label: "DELAY_COMPENSATION", type: "PERCENT", before: /interest at\s*$/ },
    {
      label: "CANCELLATION_CHARGE",
      type: "PERCENT",
      after: /^\s*of the (?:total price|booking amount)/,
      before: /deduct\s*$/,
    },
  ],
};

// --- employment -------------------------------------------------------------------------------

export const EMPLOYMENT_EXTRACTION: PackExtraction = {
  legacyPatterns: false,
  phrasePatterns: [
    {
      label: "EMPLOYER",
      regex: /^(?!For )([A-Z][\w.&' -]+?(?:Private Limited|Pvt\. Ltd\.|LLP))$/gm,
      lines: true,
    },
    {
      label: "EMPLOYER",
      regex: /^For ([A-Z][\w.&' -]+?(?:Private Limited|Pvt\. Ltd\.|LLP))$/gm,
      lines: true,
    },
    {
      label: "EMPLOYEE",
      regex: /^To,\n(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.)\s+([^\n]+)$/gm,
      lines: true,
    },
    { label: "EMPLOYEE", regex: /^\(([A-Z][A-Za-z.' ]+)\)\s*$/gm, confidence: 0.6, lines: true },
    {
      label: "JOB_TITLE",
      regex:
        /(?:position of|appoint you as|designated as|appoints the Employee as|employment as)\s+([A-Z][A-Za-z ]+?)(?= with| on | and|,|\.)/g,
    },
    {
      label: "WORK_LOCATION",
      regex: /based (?:at our office in|at)\s+([A-Z][A-Za-z ]+?)(?=\.| or )/g,
    },
    { label: "WORKING_HOURS", regex: /working hours shall be\s+([\s\S]+?)\.(?=\s*\n)/g },
    { label: "CONFIDENTIAL_INFORMATION", regex: /keep confidential\s+([\s\S]+?), both during/g },
    {
      label: "INTELLECTUAL_PROPERTY",
      regex: /(All (?:inventions|work product)[\s\S]+?) shall be the exclusive property/g,
    },
    { label: "BENEFITS", regex: /covered under\s+([\s\S]+?)\.(?=\s*\n)/g },
    JURISDICTION,
  ],
  valueRules: [
    { label: "EXECUTION_DATE", type: "DATE", before: /Date:\s*$|made on\s*$/ },
    { label: "EXPIRY_DATE", type: "DATE", before: /fixed term ending on\s*$/ },
    { label: "JOINING_DATE", type: "DATE", before: /join|report/ },
    { label: "CTC", type: "MONEY", before: /cost to company|\bCTC\b/i },
    { label: "BASE_SALARY", type: "MONEY", before: /basic salary/i },
    { label: "SALARY", type: "MONEY", before: /gross salary|monthly salary/i },
    { label: "BONUS", type: "MONEY", before: /bonus/ },
    { label: "PROBATION_PERIOD", type: "DURATION", before: /probation for\s*$/ },
    { label: "NON_COMPETE_PERIOD", type: "DURATION", after: /^\s+after leaving/ },
    { label: "LEAVE_ENTITLEMENT", type: "DURATION", after: /^\s+of paid leave/ },
    {
      label: "NOTICE_PERIOD",
      type: "DURATION",
      after: NOTICE_AFTER,
      before: /notice period of\s*$/,
    },
  ],
};

// --- NDA / MSA ----------------------------------------------------------------------------------

export const NDA_MSA_EXTRACTION: PackExtraction = {
  legacyPatterns: false,
  phrasePatterns: [
    PLACE_OF_EXECUTION,
    {
      label: "CONFIDENTIAL_INFORMATION",
      regex: /"Confidential Information" means\s+([\s\S]+?)\.(?=\s*\n|\s+[A-Z])/g,
    },
    { label: "PURPOSE", regex: /for the purpose of\s+([\s\S]+?)\s+\(["“]the Purpose/g },
    { label: "SERVICE", regex: /to provide\s+([\s\S]+? services)\b/g },
    { label: "DELIVERABLE", regex: /shall deliver\s+([\s\S]+?)(?=\.| in accordance)/g },
    {
      label: "INTELLECTUAL_PROPERTY",
      regex: /(All (?:intellectual property|rights) in the [\s\S]+?) shall vest/g,
    },
    { label: "DATA", regex: /shall process\s+([\s\S]+?)\s+only on/g },
    JURISDICTION,
  ],
  valueRules: [
    instrumentDate("EFFECTIVE_DATE"),
    { label: "FEE", type: "MONEY", before: /fee of\s*$/ },
    { label: "LIABILITY_CAP", type: "MONEY", before: /exceed\s*$/ },
    {
      label: "PAYMENT_TERM",
      type: "DURATION",
      before: /invoice within\s*$/,
      after: /^\s+of its receipt/,
    },
    { label: "TERM", type: "DURATION", before: /in force for\s*$/ },
    { label: "CONFIDENTIALITY_PERIOD", type: "DURATION", before: /(?:survive|protected) for\s*$/ },
    {
      label: "TERMINATION_NOTICE",
      type: "DURATION",
      after: NOTICE_AFTER,
      before: /(?:giving|at least)\s*$/,
    },
    { label: "WARRANTY_PERIOD", type: "DURATION", before: /defects for\s*$/ },
  ],
};
