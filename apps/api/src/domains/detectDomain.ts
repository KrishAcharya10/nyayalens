// Local domain detection (Phase 8). Deterministic and inspectable: for each
// registered DomainPack it collects the signals that match - title, party
// roles defined in the preamble, clause headings the pack recognises,
// characteristic phrases - and ranks packs by a weighted count of them.
//
// No probabilities are reported: the score is a count of matched signals,
// not a calibrated confidence, and the UI shows the signals themselves.
// Explicit metadata (the document type chosen at upload) always wins; this
// is used to check that choice and to surface a mismatch for review.
import { segmentClauses } from "../clauses/clauseSegmenter.js";
import { classifyHeading, taxonomyFromSchema } from "../clauses/clauseTaxonomy.js";
import type { DomainPack } from "./registry.js";

const WEIGHTS = { title: 6, partyRole: 4, documentType: 2, clause: 1, lexical: 1 };

export interface DomainCandidate {
  domain: string;
  documentType: string;
  score: number;
  supportingSignals: string[];
}

export interface DomainDetection {
  predictedDomain: string | null;
  predictedDocumentType: string | null;
  candidateDomains: DomainCandidate[];
  supportingSignals: string[];
  method: "deterministic-signals-v1";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectDomain(
  text: string,
  packs: readonly DomainPack<unknown, unknown>[],
): DomainDetection {
  const lines = text.split("\n").filter((l) => l.trim());
  // Title signals come from the first few lines only - a recital that
  // mentions "a registered Sale Deed" does not make an agreement a deed.
  const head = lines.slice(0, 12).join("\n");
  // Letters carry their title on a "Subject:" line below the letterhead.
  const titleLines = [
    ...lines.slice(0, 3),
    ...lines.filter((l) => /^\s*Sub(?:ject)?\s*:/i.test(l)),
  ].join("\n");
  const headings = segmentClauses(text).map((s) => s.heading);
  const flat = text.replace(/\s+/g, " ");

  const candidates: DomainCandidate[] = packs.map((pack) => {
    const signals: string[] = [];
    let score = 0;
    for (const p of pack.detection.titlePatterns) {
      const m = p.exec(head);
      if (m) {
        signals.push(`title: "${m[0]}"`);
        score += WEIGHTS.title;
        break;
      }
    }
    for (const [label, terms] of Object.entries(pack.partyTerms)) {
      const term = terms.find(
        (t) =>
          t !== "you" &&
          new RegExp(
            String.raw`referred\s+to\s+as\s+the\s+["'“]${escapeRegex(t)}S?["'”]|^${escapeRegex(t.toUpperCase())}:|For and on behalf of the ${escapeRegex(t)}\b`,
            "im",
          ).test(flat),
      );
      if (term) {
        signals.push(`party role defined: ${label} ("${term}")`);
        score += WEIGHTS.partyRole;
      }
    }
    let documentType = pack.documentTypes[0]!.id;
    for (const dt of pack.detection.documentTypes ?? []) {
      if (dt.pattern.test(titleLines)) {
        documentType = dt.documentType;
        signals.push(`document type: ${dt.documentType}`);
        score += WEIGHTS.documentType;
        break;
      }
    }
    const taxonomy = taxonomyFromSchema(pack.clauseSchema);
    const clauseTypes = new Set(
      headings.map((h) => classifyHeading(h, taxonomy)).filter((t): t is string => t !== null),
    );
    if (clauseTypes.size > 0) {
      signals.push(`clause headings matched: ${[...clauseTypes].join(", ")}`);
      score += WEIGHTS.clause * clauseTypes.size;
    }
    for (const p of pack.detection.lexicalPatterns) {
      const m = p.exec(flat);
      if (m) {
        signals.push(`phrase: "${m[0]}"`);
        score += WEIGHTS.lexical;
      }
    }
    return { domain: pack.id, documentType, score, supportingSignals: signals };
  });

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const predicted = top && top.score > 0 ? top : null;
  return {
    predictedDomain: predicted?.domain ?? null,
    predictedDocumentType: predicted?.documentType ?? null,
    candidateDomains: candidates.filter((c) => c.score > 0).slice(0, 4),
    supportingSignals: predicted?.supportingSignals ?? [],
    method: "deterministic-signals-v1",
  };
}
