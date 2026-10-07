// DomainPack registry — Phase 8, Step 1 scaffold ONLY.
//
// Not wired into any existing pipeline stage, route, or component. This
// module exists so the registry mechanics (register/get/list/duplicate-id/
// missing-pack) can be designed and tested in isolation before any
// migration of the rental/land-lease code paths happens (that is Step 2 -
// see docs/phase8/domainpack_design.md for the full design and worked
// example, and docs/phase8/step1_audit.md for the coupling this is meant
// to eventually replace).
//
// The shapes below intentionally mirror what the audited pipeline stages
// already consume (DocumentClause.clauseType / Entity.label are free-text
// columns today, ComparisonCheck already has a {name, run(context)} shape
// in pass2CrossClause.ts, etc.) so a future migration is substitution, not
// a redesign - see the design doc's section 4 for the stage-by-stage
// mapping this interface is meant to support.

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface JurisdictionScope {
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  country: string;
  /** ISO 3166-2 subdivision code, e.g. "IN-KA". Absent = nationwide. */
  state?: string;
  /** Free text; no ISO list exists at this granularity. */
  district?: string;
  /** Cross-reference into DomainPack.legalFrameworks[].id. */
  legalFrameworkId?: string;
  /** When this pack's legal content was last reviewed, e.g. "2026-09". */
  referenceVersion: string;
}

export interface LegalFrameworkRef {
  id: string;
  title: string;
  jurisdiction: JurisdictionScope;
  /** Non-authoritative summary only - never a citation payload the RAG generates from. */
  note?: string;
}

export interface DocumentTypeDescriptor {
  /** Matches the DB DocumentType enum value where one exists. */
  id: string;
  label: string;
}

export interface EntityTypeDescriptor {
  /** Matches Entity.label (free text). */
  label: string;
  displayName: string;
}

export interface ClauseTypeDescriptor {
  /** Matches DocumentClause.clauseType (free text). */
  clauseType: string;
  headingPattern: RegExp;
  /** Explicit ordering instead of array-position, since heading-match order is load-bearing. */
  priority: number;
}

export interface RelationTypeDescriptor {
  relationType: string;
  subjectEntityLabel: string;
  objectEntityLabel: string;
}

// Mirrors pass2CrossClause.ts's existing ComparisonCheck shape exactly -
// a pack supplies checks in the same format the risk engine already knows
// how to run, rather than a new rule-authoring format. Generic over the
// real risk-engine context/finding types (RiskEngineContext/RiskFinding
// from ../risk/types.js) so this module itself never has to import
// anything from risk/ - only the concrete pack files (rentalPack.ts,
// landLeasePack.ts) instantiate DomainPack<RiskEngineContext, RiskFinding>.
// This keeps the registry a generic, reusable mechanism (per Step 1's
// design) and avoids a risk/ <-> domains/ import cycle - see
// docs/phase8/step2_migration_notes.md for why that cycle is a real risk
// here, not a hypothetical one.
export interface RiskCheckDescriptor<TContext = unknown, TFinding = unknown> {
  name: string;
  run(context: TContext): TFinding[];
}

export interface RiskRuleDescriptor<TContext = unknown, TFinding = unknown> {
  expectedClauseTypes: string[];
  missingClauseSeverity: Record<string, RiskSeverity>;
  perClauseChecks: RiskCheckDescriptor<TContext, TFinding>[];
  comparisonChecks: RiskCheckDescriptor<TContext, TFinding>[];
}

export interface DomainPack<TContext = unknown, TFinding = unknown> {
  /** Stable slug, e.g. "residential_rental". */
  id: string;
  name: string;
  /** Pack content version, independent of the app's own version. */
  version: string;

  jurisdiction: JurisdictionScope;
  documentTypes: DocumentTypeDescriptor[];

  entitySchema: EntityTypeDescriptor[];
  clauseSchema: ClauseTypeDescriptor[];
  relationSchema: RelationTypeDescriptor[];
  riskSchema: RiskRuleDescriptor<TContext, TFinding>;

  legalFrameworks: LegalFrameworkRef[];

  /** Opaque to this runtime - documents a pointer to Python-side generator config, not interpreted here. */
  generatorConfig?: unknown;
  /** Opaque to this runtime - documents a pointer to evaluation config, not interpreted here. */
  evaluationConfig?: unknown;
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

export interface DomainPackRegistry<TContext = unknown, TFinding = unknown> {
  register(pack: DomainPack<TContext, TFinding>): void;
  get(id: string): DomainPack<TContext, TFinding>;
  tryGet(id: string): DomainPack<TContext, TFinding> | undefined;
  list(): readonly DomainPack<TContext, TFinding>[];
}

// Factory, not a module-level singleton - keeps tests isolated from each
// other and from whatever startup registration a future Step 2 adds,
// matching this codebase's existing preference for dependency-injected
// pure logic (e.g. pass2CrossClause.ts's runPass2(context, checks = ...)).
export function createRegistry<TContext = unknown, TFinding = unknown>(): DomainPackRegistry<
  TContext,
  TFinding
> {
  const packs = new Map<string, DomainPack<TContext, TFinding>>();

  return {
    register(pack: DomainPack<TContext, TFinding>): void {
      if (packs.has(pack.id)) {
        throw new DuplicatePackError(pack.id);
      }
      packs.set(pack.id, pack);
    },

    get(id: string): DomainPack<TContext, TFinding> {
      const pack = packs.get(id);
      if (!pack) {
        throw new PackNotFoundError(id);
      }
      return pack;
    },

    tryGet(id: string): DomainPack<TContext, TFinding> | undefined {
      return packs.get(id);
    },

    list(): readonly DomainPack<TContext, TFinding>[] {
      return [...packs.values()];
    },
  };
}
