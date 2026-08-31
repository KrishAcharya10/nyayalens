// Small shared tokenizer used by both BM25Retriever and ExtractiveLLMProvider
// - kept in one place so "what counts as a token" can't silently drift
// between retrieval and grounding decisions.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "by",
  "with",
  "at",
  "from",
  "does",
  "do",
  "did",
  "has",
  "have",
  "had",
  "will",
  "would",
  "should",
  "can",
  "could",
  "may",
  "might",
  "not",
  "no",
]);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9₹]+/g) ?? [];
}

export function meaningfulTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}
