// Consistency engine (Phase 8): interprets a DomainPack's consistencyRules
// over normalized entity values and extracted obligations. Domain-
// independent - every domain-specific decision (which values must agree,
// what must add up, which dates must be ordered, who is expected to pay)
// is data in the pack.
//
// Findings are "potential inconsistency - review required", never a
// verdict: the document may intend two different values (a revised fee),
// or extraction may have misread one. Each finding carries the conflicting
// spans as evidence and the rule id that produced it.
import type {
  ConsistencyRuleDescriptor,
  DomainPack,
  SingleValueRule,
} from "../domains/registry.js";
import type { ExtractedObligation } from "../semantic/extract.js";
import { sentences } from "../semantic/extract.js";
import { normalizeByCoreType, valueKey, type NormalizedValue } from "../semantic/normalize.js";
import type { SemanticEntity } from "../semantic/types.js";
import type { EvidenceSpan, RiskFinding, RiskSeverity } from "../risk/types.js";

interface Mention {
  entity: SemanticEntity;
  value: NormalizedValue;
  key: string;
  qualifier: string;
}

const SEVERITY: Record<string, RiskSeverity> = {
  FINANCIAL_CONTRADICTION: "HIGH",
  PAYMENT_TOTAL_MISMATCH: "HIGH",
  DATE_CONTRADICTION: "HIGH",
  PROPERTY_AREA_CONTRADICTION: "HIGH",
  PROPERTY_IDENTIFIER_CONTRADICTION: "HIGH",
  PARTY_ROLE_INCONSISTENCY: "HIGH",
  PARTY_NAME_CONTRADICTION: "HIGH",
  DURATION_CONTRADICTION: "MEDIUM",
  DEFINITION_INCONSISTENCY: "MEDIUM",
};

function evidence(documentId: string, e: SemanticEntity): EvidenceSpan {
  return {
    sourceTable: "entities",
    sourceId: e.id,
    documentId,
    textStart: e.textStart,
    textEnd: e.textEnd,
    text: e.text,
  };
}

function humanize(label: string): string {
  return label.toLowerCase().replace(/_/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Which party a value belongs to: the first party term in its clause of the
// sentence ("The Tenant may vacate after {90 days} notice, whereas the
// Landlord may ... {15 days}") - or ANY for "either party" / no party. Two
// values only conflict when they belong to the same party.
function qualifierFor(
  text: string,
  e: SemanticEntity,
  partyTerms: Record<string, string[]>,
): string {
  const sentence = sentences(text).find((s) => s.start <= e.textStart && e.textStart < s.end);
  if (!sentence) return "ANY";
  const local = sentence.text.slice(0, e.textStart - sentence.start);
  const segStart = Math.max(
    local.lastIndexOf(", whereas"),
    local.lastIndexOf(" whereas "),
    local.lastIndexOf(", while"),
    local.lastIndexOf("; "),
  );
  const segment = segStart >= 0 ? local.slice(segStart) : local;
  if (/\b(?:either|each) (?:party|the \w+ or the \w+)\b/i.test(segment)) return "ANY";
  let best: { index: number; label: string } | null = null;
  for (const [label, terms] of Object.entries(partyTerms)) {
    for (const term of terms) {
      if (term === "you") continue;
      const m = new RegExp(String.raw`\bthe\s+${escapeRegex(term)}\b`, "i").exec(segment);
      if (m && (best === null || m.index < best.index)) best = { index: m.index, label };
    }
  }
  return best?.label ?? "ANY";
}

export interface ConsistencyInput {
  documentId: string;
  pack: DomainPack<unknown, unknown>;
  text: string;
  entities: SemanticEntity[];
  obligations: ExtractedObligation[];
}

export function runConsistency(input: ConsistencyInput): RiskFinding[] {
  const { documentId, pack, text, entities, obligations } = input;
  const coreType = new Map(pack.entitySchema.map((e) => [e.label, e.coreType]));
  const singleValued = new Set(
    pack.consistencyRules
      .filter((r): r is SingleValueRule => r.kind === "SINGLE_VALUE")
      .map((r) => r.label),
  );
  const mentions = new Map<string, Mention[]>();
  for (const e of [...entities].sort((a, b) => a.textStart - b.textStart)) {
    const value = normalizeByCoreType(coreType.get(e.label) ?? "TEXT", e.text);
    if (!value) continue;
    const list = mentions.get(e.label) ?? [];
    list.push({ entity: e, value, key: valueKey(value), qualifier: "" });
    mentions.set(e.label, list);
  }
  // Only durations (notice periods) legitimately differ per party; a party
  // name or an amount must agree everywhere, including signature blocks
  // that mention the party role.
  const qualified = (label: string): Mention[] =>
    (mentions.get(label) ?? []).map((m) => ({
      ...m,
      qualifier:
        coreType.get(label) === "DURATION" ? qualifierFor(text, m.entity, pack.partyTerms) : "ANY",
    }));

  const findings: RiskFinding[] = [];
  const add = (rule: ConsistencyRuleDescriptor, reason: string, ev: EvidenceSpan[]) =>
    findings.push({
      category: rule.category as RiskFinding["category"],
      severity: SEVERITY[rule.category] ?? "MEDIUM",
      reason,
      pass: "CONSISTENCY",
      evidence: ev,
      ruleId: rule.id,
      reviewRequired: true,
    });

  for (const rule of pack.consistencyRules) {
    if (rule.kind === "SINGLE_VALUE") {
      const groups = new Map<string, Mention[]>();
      for (const m of qualified(rule.label)) {
        groups.set(m.qualifier, [...(groups.get(m.qualifier) ?? []), m]);
      }
      for (const group of groups.values()) {
        const distinct = [...new Map(group.map((m) => [m.key, m])).values()];
        if (distinct.length < 2) continue;
        const shown = distinct.map((m) => `"${m.entity.text}"`).join(" and ");
        add(
          rule,
          `The document states the ${humanize(rule.label)} as ${shown}. This is a potential ` +
            "inconsistency - review which value is intended.",
          distinct.map((m) => evidence(documentId, m.entity)),
        );
      }
    } else if (rule.kind === "SUM") {
      const total = mentions.get(rule.total)?.[0];
      if (!total || !("amount" in total.value)) continue;
      let sum = 0;
      const used: Mention[] = [];
      let complete = true;
      for (const part of rule.parts) {
        const ms = mentions.get(part) ?? [];
        if (ms.length === 0) {
          complete = false;
          break;
        }
        const counted = singleValued.has(part) ? ms.slice(0, 1) : ms;
        for (const m of counted) {
          if ("amount" in m.value) {
            sum += m.value.amount;
            used.push(m);
          }
        }
      }
      if (!complete || sum === total.value.amount) continue;
      add(
        rule,
        `The amounts for ${rule.parts.map(humanize).join(" + ")} add up to INR ${sum.toLocaleString("en-IN")}, ` +
          `but the ${humanize(rule.total)} is stated as "${total.entity.text}". This is a potential ` +
          "payment mismatch - review required.",
        [...used, total].map((m) => evidence(documentId, m.entity)),
      );
    } else if (rule.kind === "DATE_ORDER") {
      const before = mentions.get(rule.before)?.[0];
      const after = mentions.get(rule.after)?.[0];
      if (!before || !after || !("iso" in before.value) || !("iso" in after.value)) continue;
      if (before.value.iso <= after.value.iso) continue;
      add(
        rule,
        `The ${humanize(rule.after)} ("${after.entity.text}") falls before the ${humanize(rule.before)} ` +
          `("${before.entity.text}"). This is a potential date inconsistency - review required.`,
        [evidence(documentId, before.entity), evidence(documentId, after.entity)],
      );
    } else if (rule.kind === "EXPECTED_ACTOR") {
      for (const o of obligations) {
        if (o.action !== rule.action || o.amountLabel !== rule.objectLabel) continue;
        if (o.actorLabel === rule.expectedActor) continue;
        const amount = entities.find((e) => e.id === o.amountEntityId);
        add(
          rule,
          `The document states that ${o.actorText || humanize(o.actorLabel)} must pay the ` +
            `${humanize(rule.objectLabel)}, which is usually paid by the ${humanize(rule.expectedActor)}. ` +
            "This may be a drafting error - review required.",
          amount ? [evidence(documentId, amount)] : [],
        );
      }
    }
  }
  return findings;
}
