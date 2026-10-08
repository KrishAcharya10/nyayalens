// Generic risk checks (Phase 8), configured per DomainPack. Like the Phase 6
// checks these are transparent rules, not legal analysis: each finding says
// what the clause states and why it may warrant review - never that a
// clause is unlawful or unenforceable (reasonFraming.ts).
import { parseDuration } from "../semantic/normalize.js";
import { clauseToEvidence, type ClauseInput, type RiskCheck, type RiskFinding } from "./types.js";

function inClauses(clauses: ClauseInput[], types: string[] | null): ClauseInput[] {
  return clauses.filter((c) => c.text && (!types || types.includes(c.clauseType)));
}

function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DISCRETION = [
  /\bsole (?:discretion|judge?ment)\b/i,
  /\bentirely at the discretion\b/i,
  /\bas (?:the \w+ )?(?:deems?|considers?) (?:fit|appropriate|necessary)\b/i,
  /\bfor any reason the \w+ deems fit\b/i,
  /\bdecision shall be final\b/i,
  /\bwithout being required to furnish any account\b/i,
];

/** Deductions / extensions left to one party's discretion, with no objective standard. */
export function makeDiscretionCheck(clauseTypes: string[]): RiskCheck {
  return {
    name: "unbounded_discretion_generic",
    run(context) {
      return inClauses(context.clauses, clauseTypes)
        .filter((c) => DISCRETION.some((p) => p.test(flat(c.text!))))
        .map((c) => ({
          category: "UNBOUNDED_DISCRETION",
          severity: "MEDIUM",
          reason:
            "This clause leaves an outcome (such as a deduction or a date extension) to one party's " +
            "discretion, with no cap or objective standard stated. This may be potentially unfavorable " +
            "and warrants review.",
          pass: "PASS_1",
          evidence: [clauseToEvidence(context.documentId, c)],
          ruleId: "unbounded_discretion_generic",
        }));
    },
  };
}

/** Structural repairs placed on the occupant (tenant / licensee). */
export function makeLiabilityShiftCheck(clauseType: string, occupantTerms: string[]): RiskCheck {
  const terms = occupantTerms.map(escapeRegex).join("|");
  // The occupant is the one bearing the repairs *in the same sentence* that
  // mentions structural / all repairs - so "the Tenant does day-to-day
  // upkeep; structural repairs by the Landlord" is not flagged.
  const occupantBears = new RegExp(
    String.raw`\b(?:by|on) the (?:${terms})\b|\bthe (?:${terms}) (?:shall|accepts)\b`,
    "i",
  );
  const heavyRepairs =
    /\bstructural\b|\birrespective of the cause\b|\bevery repair\b|\ball repairs\b/i;
  return {
    name: "liability_shift_generic",
    run(context) {
      return inClauses(context.clauses, [clauseType])
        .filter((c) =>
          flat(c.text!)
            // "The Tenant does routine upkeep, while structural repairs are
            // borne by the Landlord" contrasts two duties in one sentence -
            // each side of "while"/"whereas" is judged on its own.
            .split(/(?<=[.;])\s+|,?\s+(?:while|whereas)\s+/)
            .some((segment) => heavyRepairs.test(segment) && occupantBears.test(segment)),
        )
        .map((c) => ({
          category: "LIABILITY_SHIFT",
          severity: "HIGH",
          reason:
            "This clause places structural or all repairs on the occupant, which is usually the owner's " +
            "responsibility. This may be a potentially unfavorable shift of liability and warrants review.",
          pass: "PASS_1",
          evidence: [clauseToEvidence(context.documentId, c)],
          ruleId: "liability_shift_generic",
        }));
    },
  };
}

const DURATION_TEXT =
  /\b(?:\w+\s\(\d{1,3}\)|\d{1,3}\s\(\w+\)|\d{1,3}|\w+)\s(?:days?|weeks?|months?|years?)\b/gi;

/** Different notice periods for different parties (or one party able to end it without notice). */
export function makeAsymmetricNoticeCheck(
  clauseTypes: string[],
  partyTerms: Record<string, string[]>,
): RiskCheck {
  return {
    name: "asymmetric_notice_generic",
    run(context) {
      const byParty = new Map<string, number>();
      const noNotice = new Set<string>();
      const clauses = inClauses(context.clauses, clauseTypes);
      for (const c of clauses) {
        for (const segment of flat(c.text!).split(/[.;]|,? whereas |,? while /)) {
          if (/\b(?:either|each) (?:party|the \w+ or the \w+)\b/i.test(segment)) continue;
          let party: string | null = null;
          let at = Infinity;
          for (const [label, terms] of Object.entries(partyTerms)) {
            for (const term of terms) {
              const m = (
                term === "you"
                  ? /\byou\b/i
                  : new RegExp(String.raw`\bthe ${escapeRegex(term)}\b`, "i")
              ).exec(segment);
              if (m && m.index < at) {
                at = m.index;
                party = label;
              }
            }
          }
          if (!party) continue;
          if (
            /\bwithout (?:any )?notice\b/i.test(segment) &&
            /\bterminat|\brevoke|\bend\b/i.test(segment)
          ) {
            noNotice.add(party);
          }
          if (!/\bnotice\b/i.test(segment)) continue;
          for (const m of segment.matchAll(DURATION_TEXT)) {
            const d = parseDuration(m[0]);
            if (d) byParty.set(party, Math.max(byParty.get(party) ?? 0, d.days));
          }
        }
      }
      const days = [...byParty.values()];
      const asymmetric =
        (days.length >= 2 && Math.max(...days) >= 2 * Math.min(...days)) ||
        (noNotice.size > 0 && [...byParty.keys()].some((p) => !noNotice.has(p)));
      if (!asymmetric || clauses.length === 0) return [];
      const finding: RiskFinding = {
        category: "ASYMMETRIC_OBLIGATION",
        severity: "MEDIUM",
        reason:
          "The parties are given materially different notice periods (or one party may end the " +
          "arrangement without notice). This may be a potentially unfavorable imbalance and warrants review.",
        pass: "PASS_2",
        evidence: clauses.map((c) => clauseToEvidence(context.documentId, c)),
        ruleId: "asymmetric_notice_generic",
      };
      return [finding];
    },
  };
}

const ONE_SIDED = [
  /\b(?:entire|whole)\b[^.]{0,40}\bforfeit/i,
  /\bforfeit(?:ed)?\b[^.]{0,60}\b(?:entire|whole|all)\b/i,
  /\bshall stand forfeited\b/i,
  /\bonly remedy\b/i,
  /\bmay cancel the allotment at any time\b/i,
  /\bfor convenience\b[^.]*\bmay terminate only\b/i,
];

/** Remedies (forfeiture, cancellation, termination for convenience) available to one side only. */
export function makeOneSidedRemedyCheck(clauseTypes: string[]): RiskCheck {
  return {
    name: "one_sided_remedy",
    run(context) {
      return inClauses(context.clauses, clauseTypes)
        .filter((c) => ONE_SIDED.some((p) => p.test(flat(c.text!))))
        .map((c) => ({
          category: "ONE_SIDED_REMEDY",
          severity: "HIGH",
          reason:
            "This clause gives one party a remedy (forfeiture, cancellation or termination at will) " +
            "without a comparable remedy for the other. This may be a potentially unfavorable " +
            "imbalance and warrants review.",
          pass: "PASS_1",
          evidence: [clauseToEvidence(context.documentId, c)],
          ruleId: "one_sided_remedy",
        }));
    },
  };
}

export const restrictiveCovenantCheck: RiskCheck = {
  name: "post_employment_restriction",
  run(context) {
    return inClauses(context.clauses, ["NON_COMPETE"])
      .filter((c) => /\bafter (?:leaving|termination|cessation)\b/i.test(flat(c.text!)))
      .map((c) => ({
        category: "RESTRICTIVE_COVENANT",
        severity: "MEDIUM",
        reason:
          "This clause restricts the employee's work after the employment ends. Post-employment " +
          "restrictions are a common subject of legal review in India; this warrants review before signing.",
        pass: "PASS_1",
        evidence: [clauseToEvidence(context.documentId, c)],
        ruleId: "post_employment_restriction",
      }));
  },
};

export const uncappedLiabilityCheck: RiskCheck = {
  name: "uncapped_liability",
  run(context) {
    return inClauses(context.clauses, null)
      .filter((c) => /\bliability\b[^.]*\bunlimited\b|\bunlimited liability\b/i.test(flat(c.text!)))
      .map((c) => ({
        category: "UNCAPPED_LIABILITY",
        severity: "HIGH",
        reason:
          "This clause leaves one party's liability uncapped. This may be a potentially significant " +
          "exposure and warrants review.",
        pass: "PASS_1",
        evidence: [clauseToEvidence(context.documentId, c)],
        ruleId: "uncapped_liability",
      }));
  },
};

/** A "mutual" NDA where only one side is actually bound. */
export const oneWayMutualConfidentialityCheck: RiskCheck = {
  name: "one_way_mutual_confidentiality",
  run(context) {
    return inClauses(context.clauses, ["CONFIDENTIALITY"])
      .filter((c) => /\bshall be free to use any information\b/i.test(flat(c.text!)))
      .map((c) => ({
        category: "ASYMMETRIC_OBLIGATION",
        severity: "MEDIUM",
        reason:
          "Only one party is bound to confidentiality, while the other may use information it " +
          "receives. This may be a potentially unfavorable imbalance and warrants review.",
        pass: "PASS_2",
        evidence: [clauseToEvidence(context.documentId, c)],
        ruleId: "one_way_mutual_confidentiality",
      }));
  },
};
