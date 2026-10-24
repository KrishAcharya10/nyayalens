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
  // "whenever the Landlord considers the Tenant's conduct undesirable",
  // "if the Owner believes the Cultivator has used the Land improperly".
  /\b(?:whenever|if|where|when|as)\s+the \w+ (?:considers?|believes?|feels?|thinks?|deems?)\b[^.;]{0,100}?\b(?:undesirable|improper(?:ly)?|unsatisfactory|inappropriate|unacceptable|objectionable|misused?|unfit)\b/i,
  /\bin the (?:sole )?(?:opinion|judge?ment) of the \w+\b/i,
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
            "This clause leaves an outcome (such as a deduction, an extension or ending the " +
            "arrangement) to one party's own judgement, with no cap or objective standard stated. " +
            "This may be potentially unfavorable and warrants review.",
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
  // upkeep; structural repairs by the Landlord" is not flagged. "by the
  // Tenant" only counts as bearing the cost when it is not the cause of the
  // damage ("except for damage caused by the Tenant's negligence" is the
  // usual carve-out in a clause that puts repairs on the owner).
  const occupantBears = new RegExp(
    String.raw`(?<!\b(?:caus\w+|damag\w+|loss|due|attributable|negligen\w+|misuse|default|fault)\s+(?:\w+\s+){0,2})\b(?:by|on) the (?:${terms})\b(?!['’]s)|\bthe (?:${terms}) (?:shall|must|will|accepts|agrees to)\b[^.;]{0,60}?\b(?:bear|pay|undertake|carry out|meet|responsib\w+|liab\w+|repair|maintain)`,
    "i",
  );
  const heavyRepairs =
    /\bstructural\b|\birrespective of the cause\b|\bevery repair\b|\ball repairs\b/i;
  const aboutRepairs = /\brepair|\bmaintain|\bmaintenance|\bupkeep/i;
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
            .some(
              (segment) =>
                heavyRepairs.test(segment) &&
                aboutRepairs.test(segment) &&
                occupantBears.test(segment),
            ),
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
      let mutualNotice = false;
      const clauses = inClauses(context.clauses, clauseTypes);
      for (const c of clauses) {
        for (const segment of flat(c.text!).split(/[.;]|,? whereas |,? while /)) {
          if (/\b(?:either|each) (?:party|the \w+ or the \w+)\b/i.test(segment)) {
            // A notice period that binds both sides ("Either party may terminate
            // by giving 60 days' written notice") - the baseline a one-sided
            // "without notice" right is measured against.
            if (/\bnotice\b/i.test(segment)) mutualNotice = true;
            continue;
          }
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
            /\bterminat|\brevoke|\bend\b|\bvacate|\bevict|\bremove|\bleave\b/i.test(segment)
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
        (noNotice.size > 0 && (mutualNotice || [...byParty.keys()].some((p) => !noNotice.has(p))));
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
  // "the Licensor may retain the entire security deposit if the Licensee gives any notice".
  /\bretain(?:s|ed)?\b[^.]{0,60}\b(?:entire|whole|full)\b[^.]{0,40}\b(?:deposit|advance|amount)\b/i,
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
      .filter((c) =>
        /\bafter (?:leaving|termination|cessation|(?:the )?employment (?:ends|ceases|terminates))\b/i.test(
          flat(c.text!),
        ),
      )
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

// Unlimited liability, or an indemnity stated without a limit. An indemnity that sits
// outside a liability cap is a commercial choice that deserves a second look, not an error.
const UNCAPPED =
  /\bliability\b[^.]*\bunlimited\b|\bunlimited liability\b|\bindemni(?:ty|ties|f\w*)\b[^.]*\b(?:without (?:any )?(?:limit|cap)|unlimited|uncapped|not (?:be )?subject to (?:any )?(?:limit|cap))\b/i;

export const uncappedLiabilityCheck: RiskCheck = {
  name: "uncapped_liability",
  run(context) {
    return inClauses(context.clauses, null)
      .filter((c) => UNCAPPED.test(flat(c.text!)))
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

/**
 * A deposit clause that promises a refund but never says when. This is a term
 * the document leaves out, not a contradiction, and nothing here says a deadline
 * is legally required - the finding only asks the reader whether one is intended.
 */
export const depositRefundDeadlineCheck: RiskCheck = {
  name: "missing_term_deposit_refund_deadline",
  run(context) {
    return inClauses(context.clauses, ["SECURITY_DEPOSIT"])
      .filter((c) => {
        // Only the sentences that promise the refund can supply its timing
        // ("equal to 3 months' rent" is an amount, not a deadline).
        const refundSentences = flat(c.text!)
          .split(/(?<=[.;])\s+/)
          .filter((s) =>
            /\brefund(?:ed|able|s)?\b|\bshall return\b|\bwill be returned\b|\breturned to\b/i.test(
              s,
            ),
          );
        const timing =
          /\b\d+\s*(?:\(\w+\)\s*)?(?:days?|weeks?|months?)\b|\bon or before\b|\bimmediately\b|\bsame day\b|\bforthwith\b/i;
        // "A refundable deposit of X" describes the deposit; only a sentence that says
        // what happens to it afterwards (is refunded / shall return) promises a refund.
        const promises = refundSentences.filter((s) =>
          /\b(?:will|shall|is to|must|to)\s+(?:be\s+)?(?:refund|return)|\bis refunded\b|\brefund(?:ed)? (?:to|after|on|upon|within)\b|\breturn\w* (?:it|the deposit|to the)\b/i.test(
            s,
          ),
        );
        return promises.length > 0 && !promises.some((s) => timing.test(s));
      })
      .map((c) => ({
        category: "MISSING_CLAUSE" as const,
        severity: "LOW" as const,
        reason:
          "This clause says the deposit will be refunded but does not state when. The document leaves " +
          "the refund timing open; this is not a contradiction. Consider whether a deadline is intended.",
        pass: "PASS_1" as const,
        evidence: [clauseToEvidence(context.documentId, c)],
        ruleId: "missing_term_deposit_refund_deadline",
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
