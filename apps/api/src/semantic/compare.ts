// Document comparison (Phase 8): two documents' extracted facts, clauses,
// obligations and risk findings side by side, each item marked SAME,
// CHANGED, ADDED (only in B) or REMOVED (only in A), with the evidence span
// from each side. Pure and deterministic - the route loads both documents
// (after checking the caller owns both) and calls this.
//
// Values are compared on their normalized form (valueKey), so "Rs. 25,000"
// and "INR 25000" are the SAME rent; parties are compared as sets of names
// (co-owners in a different order are not a change).
import type { DomainPack } from "../domains/registry.js";
import { normalizeByCoreType, valueKey, type NormalizedValue } from "./normalize.js";
import type { SemanticEntity } from "./types.js";

export type DiffStatus = "SAME" | "CHANGED" | "ADDED" | "REMOVED";

export interface CompareClause {
  id: string;
  clauseType: string;
  clauseNumber: string | null;
  text: string;
  textStart: number;
  textEnd: number;
}

export interface CompareObligation {
  actorLabel: string;
  action: string;
  amountInr: number | null;
  deadlineText: string | null;
  evidenceText: string;
  textStart: number;
  textEnd: number;
}

export interface CompareRelation {
  relationType: string;
  subjectLabel: string;
  objectLabel: string;
  /** The object entity's text (the related value). */
  objectText: string;
}

export interface CompareRisk {
  id: string;
  category: string;
  severity: string;
  reason: string;
}

export interface CompareSide {
  documentId: string;
  documentType: string;
  pack: DomainPack<unknown, unknown>;
  entities: SemanticEntity[];
  clauses: CompareClause[];
  obligations: CompareObligation[];
  risks: CompareRisk[];
  relations?: CompareRelation[];
}

export interface SideValue {
  text: string;
  normalized: NormalizedValue | null;
  textStart: number;
  textEnd: number;
}

export interface FieldDiff {
  label: string;
  displayName: string;
  coreType: string;
  status: DiffStatus;
  a: SideValue[];
  b: SideValue[];
}

export interface ClauseDiff {
  clauseType: string;
  status: DiffStatus;
  a: Pick<CompareClause, "clauseNumber" | "textStart" | "textEnd"> | null;
  b: Pick<CompareClause, "clauseNumber" | "textStart" | "textEnd"> | null;
}

export interface RelationDiff {
  relationType: string;
  subjectLabel: string;
  objectLabel: string;
  status: DiffStatus;
  a: string[];
  b: string[];
}

export interface ObligationDiff {
  actorLabel: string;
  action: string;
  status: DiffStatus;
  a: CompareObligation | null;
  b: CompareObligation | null;
}

export interface RiskDiff {
  category: string;
  status: Exclude<DiffStatus, "CHANGED">;
  a: CompareRisk | null;
  b: CompareRisk | null;
}

export interface DocumentComparison {
  a: { documentId: string; documentType: string; domain: string };
  b: { documentId: string; documentType: string; domain: string };
  sameDomain: boolean;
  fields: FieldDiff[];
  clauses: ClauseDiff[];
  obligations: ObligationDiff[];
  relations: RelationDiff[];
  risks: RiskDiff[];
  summary: Record<DiffStatus, number>;
}

function status(inA: boolean, inB: boolean, same: boolean): DiffStatus {
  if (inA && !inB) return "REMOVED";
  if (!inA && inB) return "ADDED";
  return same ? "SAME" : "CHANGED";
}

function sideValues(entities: SemanticEntity[], label: string, coreType: string): SideValue[] {
  const mentions = entities
    .filter((e) => e.label === label)
    .sort((x, y) => x.textStart - y.textStart);
  // Parties: every distinct name. Other fields: the first (defining) mention.
  const picked =
    coreType === "PARTY"
      ? [...new Map(mentions.map((m) => [m.text.replace(/\s+/g, " ").toLowerCase(), m])).values()]
      : mentions.slice(0, 1);
  return picked.map((m) => ({
    text: m.text,
    normalized: normalizeByCoreType(coreType, m.text),
    textStart: m.textStart,
    textEnd: m.textEnd,
  }));
}

const keySet = (values: SideValue[]) =>
  [...new Set(values.map((v) => valueKey(v.normalized)))].sort().join("|");
const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export function compareDocuments(a: CompareSide, b: CompareSide): DocumentComparison {
  // Field schema: A's pack first, then any label only B's pack defines.
  const schema = new Map<string, { displayName: string; coreType: string }>();
  for (const pack of [a.pack, b.pack]) {
    for (const e of pack.entitySchema) {
      if (!schema.has(e.label))
        schema.set(e.label, { displayName: e.displayName, coreType: e.coreType });
    }
  }
  const fields: FieldDiff[] = [];
  for (const [label, { displayName, coreType }] of schema) {
    const av = sideValues(a.entities, label, coreType);
    const bv = sideValues(b.entities, label, coreType);
    if (av.length === 0 && bv.length === 0) continue;
    fields.push({
      label,
      displayName,
      coreType,
      status: status(av.length > 0, bv.length > 0, keySet(av) === keySet(bv)),
      a: av,
      b: bv,
    });
  }

  const firstByType = (cs: CompareClause[]) => {
    const m = new Map<string, CompareClause>();
    for (const c of [...cs].sort((x, y) => x.textStart - y.textStart)) {
      if (!m.has(c.clauseType)) m.set(c.clauseType, c);
    }
    return m;
  };
  const ca = firstByType(a.clauses);
  const cb = firstByType(b.clauses);
  const pickClause = (c: CompareClause | undefined) =>
    c ? { clauseNumber: c.clauseNumber, textStart: c.textStart, textEnd: c.textEnd } : null;
  const clauses: ClauseDiff[] = [...new Set([...ca.keys(), ...cb.keys()])].map((clauseType) => {
    const x = ca.get(clauseType);
    const y = cb.get(clauseType);
    return {
      clauseType,
      status: status(!!x, !!y, !!x && !!y && squash(x.text) === squash(y.text)),
      a: pickClause(x),
      b: pickClause(y),
    };
  });

  const obKey = (o: CompareObligation) => `${o.actorLabel}:${o.action}`;
  const firstOb = (os: CompareObligation[]) => {
    const m = new Map<string, CompareObligation>();
    for (const o of os) if (!m.has(obKey(o))) m.set(obKey(o), o);
    return m;
  };
  const oa = firstOb(a.obligations);
  const ob = firstOb(b.obligations);
  const obligations: ObligationDiff[] = [...new Set([...oa.keys(), ...ob.keys()])].map((k) => {
    const x = oa.get(k);
    const y = ob.get(k);
    const [actorLabel, action] = k.split(":") as [string, string];
    const same =
      !!x &&
      !!y &&
      x.amountInr === y.amountInr &&
      squash(x.deadlineText ?? "") === squash(y.deadlineText ?? "");
    return { actorLabel, action, status: status(!!x, !!y, same), a: x ?? null, b: y ?? null };
  });

  // Relations: SUBJECT -RELATION-> OBJECT, compared on the object's
  // normalized value(s) ("BUYER MUST_PAY SALE_CONSIDERATION").
  const coreTypeOf = new Map(
    [...b.pack.entitySchema, ...a.pack.entitySchema].map((e) => [e.label, e.coreType]),
  );
  const relKey = (r: CompareRelation) => `${r.subjectLabel}|${r.relationType}|${r.objectLabel}`;
  const groupRel = (rs: CompareRelation[]) => {
    const m = new Map<string, CompareRelation[]>();
    for (const r of rs) m.set(relKey(r), [...(m.get(relKey(r)) ?? []), r]);
    return m;
  };
  const rla = groupRel(a.relations ?? []);
  const rlb = groupRel(b.relations ?? []);
  const relValues = (rs: CompareRelation[] | undefined) => [
    ...new Set((rs ?? []).map((r) => r.objectText)),
  ];
  const relValueKey = (rs: CompareRelation[] | undefined) =>
    [
      ...new Set(
        (rs ?? []).map((r) =>
          valueKey(normalizeByCoreType(coreTypeOf.get(r.objectLabel) ?? "TEXT", r.objectText)),
        ),
      ),
    ]
      .sort()
      .join("|");
  const relations: RelationDiff[] = [...new Set([...rla.keys(), ...rlb.keys()])].map((k) => {
    const [subjectLabel, relationType, objectLabel] = k.split("|") as [string, string, string];
    const x = rla.get(k);
    const y = rlb.get(k);
    return {
      relationType,
      subjectLabel,
      objectLabel,
      status: status(!!x, !!y, relValueKey(x) === relValueKey(y)),
      a: relValues(x),
      b: relValues(y),
    };
  });

  const ra = new Map(a.risks.map((r) => [r.category, r]));
  const rb = new Map(b.risks.map((r) => [r.category, r]));
  const risks: RiskDiff[] = [...new Set([...ra.keys(), ...rb.keys()])].map((category) => {
    const x = ra.get(category);
    const y = rb.get(category);
    return {
      category,
      status: status(!!x, !!y, true) as RiskDiff["status"],
      a: x ?? null,
      b: y ?? null,
    };
  });

  const summary: Record<DiffStatus, number> = { SAME: 0, CHANGED: 0, ADDED: 0, REMOVED: 0 };
  for (const item of [...fields, ...clauses, ...obligations, ...relations, ...risks]) {
    summary[item.status]++;
  }

  return {
    a: { documentId: a.documentId, documentType: a.documentType, domain: a.pack.id },
    b: { documentId: b.documentId, documentType: b.documentType, domain: b.pack.id },
    sameDomain: a.pack.id === b.pack.id,
    fields,
    clauses,
    obligations,
    relations,
    risks,
    summary,
  };
}
