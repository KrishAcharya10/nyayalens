// DomainPack contract + registry (Phase 8).
//
// A DomainPack is everything that differs between legal-document domains
// (rental, land lease, sale, employment, ...) expressed as DATA plus a few
// pluggable check functions, so the core pipeline stages stay
// domain-independent: NER, clause classification, the risk engine, domain
// detection and (later) relation/obligation extraction all ask the
// registry for "the pack for this document" instead of branching on a
// document type. See docs/domain_packs.md for the full contract and
// docs/phase8/ for the audit and migration history.
//
// Two identifiers, deliberately distinct:
//   - pack.id: the DOMAIN slug ("residential_rental", "sale_property").
//   - pack.documentTypes[].id: the DB DocumentType enum value(s) the pack
//     owns ("RESIDENTIAL_RENTAL"; a sale pack owns both AGREEMENT_TO_SELL
//     and SALE_DEED). Documents store a document type, so pipeline code
//     resolves packs with registry.forDocumentType(), never registry.get().
//
// Generic over the risk-engine context/finding types so this module never
// imports from risk/ - only concrete pack files instantiate
// DomainPack<RiskEngineContext, RiskFinding>. That keeps the registry
// reusable and avoids the risk/ <-> domains/ import cycle documented in
// docs/phase8/step2_migration_notes.md.

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface JurisdictionScope {
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  country: string;
  /** ISO 3166-2 subdivision code, e.g. "IN-MH". Absent = nationwide. */
  state?: string;
  /** Free text; no ISO list exists at this granularity. */
  district?: string;
  /** Cross-reference into DomainPack.legalFrameworks[].id. */
  legalFrameworkId?: string;
  /** When this pack's legal content was last reviewed, e.g. "2026-09". */
  referenceVersion: string;
}

// --- Legal reference layer --------------------------------------------------
// Kept strictly separate from document evidence and model inference (see
// docs/legal_reference_policy.md). Reference metadata is never generated
// by a model and never presented as applicable to a specific document
// without a human/authoritative check - `verification` says how far it
// has been checked, and no section number is recorded unless it is known.

export type LegalReferenceVerification =
  /** Checked against the official text (e.g. India Code) by a person. */
  | "VERIFIED_OFFICIAL_TEXT"
  /** Real instrument/section from the maintainers' knowledge, not yet checked against official text. */
  | "UNVERIFIED";

export interface LegalFrameworkRef {
  id: string;
  /** Short display title, e.g. "Transfer of Property Act, 1882 - s.105". */
  title: string;
  jurisdiction: JurisdictionScope;
  /** Enacting authority, e.g. "Parliament of India", "Maharashtra Legislature". */
  authority?: string;
  /** The instrument's name, e.g. "Transfer of Property Act, 1882". */
  instrument?: string;
  /** Section/article; omitted rather than guessed when not known. */
  section?: string;
  /** ISO date (YYYY-MM-DD) the provision took effect, when known. */
  effectiveFrom?: string;
  /** ISO date it ceased to apply; absent = in force as far as recorded. */
  effectiveTo?: string;
  /** Non-authoritative one-line description - never a citation payload the RAG generates from. */
  note?: string;
  /** Official source URL, only when known - never constructed by pattern. */
  sourceUrl?: string;
  verification?: LegalReferenceVerification;
}

export interface DocumentTypeDescriptor {
  /** The DB DocumentType enum value (uppercase), e.g. "SALE_DEED". */
  id: string;
  /** Wire/upload value (the enum's @map), e.g. "sale_deed". */
  slug: string;
  label: string;
}

// --- Entity ontology: three layers -------------------------------------------
// 1. coreType - WHAT a span is, shared by every domain (a person, an amount).
// 2. label    - the ROLE it plays in this domain (LESSOR, SALE_CONSIDERATION).
//    This is the value stored in Entity.label.
// 3. relations (RelationTypeDescriptor) - how roles connect.

export const CORE_ENTITY_TYPES = [
  "PARTY", // a person or organisation acting as a party
  "PERSON",
  "ORGANIZATION",
  "MONEY",
  "PERCENT",
  "DATE",
  "DURATION",
  "ADDRESS",
  "LOCATION",
  "PROPERTY_IDENTIFIER", // survey / CTS / khata / plot / flat numbers
  "AREA",
  "TEXT", // a free-text span (a permitted use, a job title, a definition)
] as const;
export type CoreEntityType = (typeof CORE_ENTITY_TYPES)[number];

export interface EntityTypeDescriptor {
  /** Matches Entity.label (free text) - the domain role. */
  label: string;
  displayName: string;
  coreType: CoreEntityType;
}

export interface ClauseTypeDescriptor {
  /** Matches DocumentClause.clauseType (free text). */
  clauseType: string;
  headingPattern: RegExp;
  /** Explicit ordering instead of array-position, since heading-match order is load-bearing. Lower runs first. */
  priority: number;
}

export interface RelationTypeDescriptor {
  relationType: string;
  subjectEntityLabel: string;
  objectEntityLabel: string;
  description?: string;
}

/** An obligation kind: ACTOR must ACTION (object/amount/deadline/...). */
export interface ObligationTypeDescriptor {
  /** e.g. "PAY", "DELIVER_POSSESSION", "SERVE_NOTICE". */
  action: string;
  /** Entity labels (roles) that can bear this obligation. */
  actorLabels: string[];
  description: string;
  /** Matched against the words after "shall"/"will"/... to recognize this action. */
  verbPattern?: RegExp;
}

// --- Pack-driven extraction ---------------------------------------------------
// Data for the domain-independent extraction engine (ner/packNer.ts): the
// engine finds typed values (money, dates, durations, percentages, areas)
// and party names on its own; a pack only says which context turns a
// value into which role, plus phrase patterns for free-text fields.

export type ValueType = "MONEY" | "DATE" | "DURATION" | "PERCENT" | "AREA";

export interface ValueRule {
  label: string;
  type: ValueType;
  /** Tested against the sentence text before the value (rules are tried in order). */
  before?: RegExp;
  /** Tested against the few words right after the value; an after-match wins over before-matches. */
  after?: RegExp;
  /** Only applies when the whole document matches (e.g. carpet area only in flat sales). */
  requires?: RegExp;
}

export interface PhrasePattern {
  label: string;
  /** Global regex; capture group `group` (default 1) is the entity span. */
  regex: RegExp;
  group?: number;
  confidence?: number;
  /** Match against the original text (line structure intact) instead of the line-unwrapped view. */
  lines?: boolean;
}

export interface PackExtraction {
  valueRules: ValueRule[];
  phrasePatterns: PhrasePattern[];
  /** Run the original v1 rule patterns (rulePatterns.ts) too. Default true; new domains turn it off. */
  legacyPatterns?: boolean;
  /** Extract party names from preamble/signature blocks via partyTerms. Default true. */
  partyExtraction?: boolean;
}

// Cross-fact consistency rules, as data the domain-independent consistency
// engine interprets. `category` is the finding category reported (a
// RiskCategory value).
interface ConsistencyRuleBase {
  id: string;
  description: string;
  category: string;
}

/** Every mention of `label` must carry the same normalized value (grouped by party qualifier where one is stated). */
export interface SingleValueRule extends ConsistencyRuleBase {
  kind: "SINGLE_VALUE";
  label: string;
}

/** The values of `parts` must add up to `total` (e.g. advance + balance = consideration). */
export interface SumRule extends ConsistencyRuleBase {
  kind: "SUM";
  parts: string[];
  total: string;
}

/** The date labeled `before` must not fall after the date labeled `after`. */
export interface DateOrderRule extends ConsistencyRuleBase {
  kind: "DATE_ORDER";
  before: string;
  after: string;
}

/** An obligation with `action` on an amount labeled `objectLabel` is expected to be borne by `expectedActor`. */
export interface ExpectedActorRule extends ConsistencyRuleBase {
  kind: "EXPECTED_ACTOR";
  action: string;
  objectLabel: string;
  expectedActor: string;
}

export type ConsistencyRuleDescriptor =
  SingleValueRule | SumRule | DateOrderRule | ExpectedActorRule;

// --- Domain detection signals -------------------------------------------------
// Deterministic, inspectable evidence for "which domain is this document"
// - no fabricated probabilities. Detection reports which signals matched.

export interface DetectionSignals {
  /** Matched against the document's title / first heading. */
  titlePatterns: RegExp[];
  /** Phrases characteristic of the domain anywhere in the text. */
  lexicalPatterns: RegExp[];
  /** Which of the pack's document types a title indicates (first match wins; default = first type). */
  documentTypes?: Array<{ documentType: string; pattern: RegExp }>;
}

// Mirrors the risk engine's existing {name, run(context)} check shape.
export interface RiskCheckDescriptor<TContext = unknown, TFinding = unknown> {
  name: string;
  run(context: TContext): TFinding[];
}

export interface RiskRuleDescriptor<TContext = unknown, TFinding = unknown> {
  /** Union across the pack's document types (for display). */
  expectedClauseTypes: string[];
  /** Per-document-type expectations, when a domain's document types differ. */
  expectedClauseTypesByDocumentType?: Record<string, string[]>;
  missingClauseSeverity: Record<string, RiskSeverity>;
  perClauseChecks: RiskCheckDescriptor<TContext, TFinding>[];
  comparisonChecks: RiskCheckDescriptor<TContext, TFinding>[];
}

export interface DomainPack<TContext = unknown, TFinding = unknown> {
  /** Domain slug, e.g. "residential_rental". */
  id: string;
  name: string;
  description: string;
  /** Pack content version, independent of the app's own version. */
  version: string;

  jurisdiction: JurisdictionScope;
  documentTypes: DocumentTypeDescriptor[];

  entitySchema: EntityTypeDescriptor[];
  /**
   * Surface words a document uses for each party role (entity label ->
   * terms), e.g. SELLER -> ["Seller", "Vendor"]. Drives party extraction,
   * obligation actor resolution and domain detection.
   */
  partyTerms: Record<string, string[]>;
  /** Entity labels summarised on the workspace Overview card, in order. */
  overviewFields: string[];
  /**
   * Pack-driven extraction rules. For packs that also have legacy
   * rule patterns (rental, land lease), these only add labels the legacy
   * patterns never produce, so v1 results are unchanged.
   */
  extraction?: PackExtraction;
  clauseSchema: ClauseTypeDescriptor[];
  relationSchema: RelationTypeDescriptor[];
  obligationSchema: ObligationTypeDescriptor[];
  riskSchema: RiskRuleDescriptor<TContext, TFinding>;
  consistencyRules: ConsistencyRuleDescriptor[];
  detection: DetectionSignals;

  legalFrameworks: LegalFrameworkRef[];

  /** Pointer to the Python-side generator for this domain, e.g. "research/generator/domains/sale_property.py". */
  generatorConfig?: { module: string };
  /** Which labels/relations evaluation scores for this domain. */
  evaluationConfig?: { entityLabels: string[]; relationTypes: string[] };
}

export class DuplicatePackError extends Error {
  constructor(id: string) {
    super(`A domain pack with id "${id}" is already registered.`);
    this.name = "DuplicatePackError";
  }
}

export class PackNotFoundError extends Error {
  constructor(id: string) {
    super(`No domain pack is registered with id "${id}".`);
    this.name = "PackNotFoundError";
  }
}

export class DuplicateDocumentTypeError extends Error {
  constructor(documentType: string, existingPackId: string) {
    super(`Document type "${documentType}" is already owned by domain pack "${existingPackId}".`);
    this.name = "DuplicateDocumentTypeError";
  }
}

export interface DomainPackRegistry<TContext = unknown, TFinding = unknown> {
  register(pack: DomainPack<TContext, TFinding>): void;
  get(id: string): DomainPack<TContext, TFinding>;
  tryGet(id: string): DomainPack<TContext, TFinding> | undefined;
  /** The pack owning a DB DocumentType value; throws PackNotFoundError if none. */
  forDocumentType(documentType: string): DomainPack<TContext, TFinding>;
  /** The document type whose upload slug is `slug` (e.g. "sale_deed"), across all packs. */
  findDocumentTypeBySlug(
    slug: string,
  ): { pack: DomainPack<TContext, TFinding>; documentType: DocumentTypeDescriptor } | undefined;
  list(): readonly DomainPack<TContext, TFinding>[];
}

// Factory, not a module-level singleton - keeps tests isolated from each
// other and from the app's startup registration (domains/index.ts).
export function createRegistry<TContext = unknown, TFinding = unknown>(): DomainPackRegistry<
  TContext,
  TFinding
> {
  const packs = new Map<string, DomainPack<TContext, TFinding>>();
  const byDocumentType = new Map<string, DomainPack<TContext, TFinding>>();

  return {
    register(pack) {
      if (packs.has(pack.id)) {
        throw new DuplicatePackError(pack.id);
      }
      // Each document type must resolve to exactly one pack, or
      // forDocumentType() would be ambiguous.
      for (const dt of pack.documentTypes) {
        const owner = byDocumentType.get(dt.id);
        if (owner) throw new DuplicateDocumentTypeError(dt.id, owner.id);
      }
      packs.set(pack.id, pack);
      for (const dt of pack.documentTypes) byDocumentType.set(dt.id, pack);
    },

    get(id) {
      const pack = packs.get(id);
      if (!pack) {
        throw new PackNotFoundError(id);
      }
      return pack;
    },

    tryGet(id) {
      return packs.get(id);
    },

    forDocumentType(documentType) {
      const pack = byDocumentType.get(documentType);
      if (!pack) {
        throw new PackNotFoundError(`(document type ${documentType})`);
      }
      return pack;
    },

    findDocumentTypeBySlug(slug) {
      for (const pack of packs.values()) {
        const documentType = pack.documentTypes.find((dt) => dt.slug === slug);
        if (documentType) return { pack, documentType };
      }
      return undefined;
    },

    list() {
      return [...packs.values()];
    },
  };
}
