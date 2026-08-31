import { classifyHeading } from "./clauseTaxonomy.js";
import { segmentClauses } from "./clauseSegmenter.js";

export interface ClassifiedClause {
  clauseType: string;
  clauseNumber: string;
  text: string;
  textStart: number;
  textEnd: number;
  confidence: number;
  modelName: string;
}

const MODEL_NAME = "nyayalens-rule-based-clause-v1";

export function runRuleBasedClauseClassification(canonicalText: string): ClassifiedClause[] {
  const segments = segmentClauses(canonicalText);
  const classified: ClassifiedClause[] = [];

  for (const segment of segments) {
    const clauseType = classifyHeading(segment.heading);
    // A heading that doesn't match any known taxonomy entry is real
    // information (a clause type this baseline doesn't recognize yet),
    // not something to guess at - skip rather than fabricate a label.
    if (!clauseType) continue;

    classified.push({
      clauseType,
      clauseNumber: segment.clauseNumber,
      text: segment.text,
      textStart: segment.textStart,
      textEnd: segment.textEnd,
      confidence: 0.75,
      modelName: MODEL_NAME,
    });
  }

  return classified;
}
