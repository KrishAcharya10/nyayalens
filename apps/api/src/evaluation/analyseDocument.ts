// The in-memory analysis the evaluation scripts and benchmark tests run: the same
// functions the upload pipeline calls (rule-based NER, clause classification,
// analyzeText), without a database. Not used by the application itself.
import { readFileSync } from "node:fs";
import { taxonomyFromSchema } from "../clauses/clauseTaxonomy.js";
import { runRuleBasedClauseClassification } from "../clauses/ruleBasedClauseClassifier.js";
import { getDomainPackRegistry } from "../domains/index.js";
import { DOCX_MIME_TYPE, extractCanonicalText } from "../extraction/extractText.js";
import { runRuleBasedNer } from "../ner/rulePatterns.js";
import { analyzeText } from "../semantic/analyze.js";
import { pageSpans } from "../semantic/facts.js";

export async function analyseDocx(path: string, documentId: string, documentType: string) {
  const { canonicalText, pages } = await extractCanonicalText(DOCX_MIME_TYPE, readFileSync(path));
  return analyseCanonicalText(canonicalText, pages, documentId, documentType);
}

export function analyseCanonicalText(
  text: string,
  pages: Array<{ pageNumber: number; text: string | null }>,
  documentId: string,
  documentType: string,
) {
  const type = documentType.toUpperCase();
  const pack = getDomainPackRegistry().forDocumentType(type);
  const entities = runRuleBasedNer(text, {
    allowedLabels: new Set(pack.entitySchema.map((e) => e.label)),
    pack,
  }).map((e, i) => ({
    id: `e${i}`,
    label: e.label,
    text: e.text,
    textStart: e.textStart,
    textEnd: e.textEnd,
  }));
  const clauses = runRuleBasedClauseClassification(text, taxonomyFromSchema(pack.clauseSchema)).map(
    (c, i) => ({
      id: `c${i}`,
      clauseType: c.clauseType,
      clauseNumber: c.clauseNumber,
      text: c.text,
      textStart: c.textStart,
      textEnd: c.textEnd,
    }),
  );
  const analysis = analyzeText({
    documentId,
    documentType: type,
    pack,
    text,
    pages: pageSpans(pages),
    entities,
    clauses,
  });
  return { text, pages, pack, documentType: type, entities, clauses, ...analysis };
}
