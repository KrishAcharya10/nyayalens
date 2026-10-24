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

// Brute-force protection for POST /auth/login. Only FAILED attempts count
// (skipSuccessfulRequests), and the key is the client address plus the
// email being tried, so a run of wrong passwords for one account does not
// lock anyone else out, and a user who signs in correctly is never throttled.
// The counter is in-memory, which is right for a single local API process.
export function createLoginRateLimiter(options: { maxFailures: number; windowMs: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.maxFailures,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      return `${req.ip ?? "unknown"}|${email}`;
    },
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many failed sign-in attempts. Try again later." });
    },
  });
}
