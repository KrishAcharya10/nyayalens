// Every risk `reason` string must read as "potentially unfavorable /
// requires review," never a definitive legal judgment - NyayaLens is not
// a lawyer and must never claim a clause "is illegal"/"is invalid"/
// "is void". This is enforced by how the per-category reason builders in
// pass1PerClause.ts/pass2CrossClause.ts are written (every one uses
// FRAMING_PREFIX or an equivalent hedge), and verified by
// apps/api/tests/reasonFraming.test.ts, which checks real generated
// reason strings against FORBIDDEN_PHRASES - not a substitute for writing
// careful templates in the first place, just a guardrail against
// regressions.
export const FORBIDDEN_PHRASES = [
  "is illegal",
  "is invalid",
  "is void",
  "is unenforceable",
  "is unlawful",
  "must be struck down",
  "violates the law",
];

export function containsDefinitiveJudgment(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_PHRASES.some((phrase) => lower.includes(phrase));
}
