import rateLimit from "express-rate-limit";

// New in Phase 7A. No rate-limiting infrastructure existed anywhere in
// Phase 1-6 to reuse (checked: no express-rate-limit dependency, no
// middleware/ file implementing one) - this is new infrastructure, not a
// reuse, see docs/architecture/rag_design.md's deviations section.
// Applied only to /documents/:id/ask, which calls an LLM provider per
// request. Keyed by authenticated user id (falls back to IP only if
// somehow unauthenticated, though requireAuth always runs first on this
// route) rather than IP alone, so one user's usage never throttles
// another's.
export const askRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
});
