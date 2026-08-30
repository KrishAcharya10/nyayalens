# Authentication & authorization

## Password hashing: Argon2id

Passwords are hashed with **Argon2id** (the `argon2` npm package, which
binds the reference `argon2` C library) — not bcrypt. Argon2id tooling was
available and installed cleanly in this environment (`npm install argon2`
built successfully via prebuilt binaries), so the bcrypt fallback named in
the build prompt was not needed.

Cost parameters are configurable via environment variables rather than
hardcoded (`ARGON2_MEMORY_COST_KIB`, `ARGON2_TIME_COST`,
`ARGON2_PARALLELISM`; see `.env.example`), defaulting to 19 MiB memory,
time cost 2, parallelism 1 — [OWASP's current minimum recommendation](
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
for Argon2id at time cost 2. Plaintext passwords are never stored or
logged; only `argon2.hash()` output is persisted, in `users.password_hash`.

## Access tokens

- JWTs, signed with `JWT_ACCESS_SECRET`, algorithm pinned to `HS256`.
- Lifetime is configurable via `ACCESS_TOKEN_TTL_MINUTES` (default 15),
  not hardcoded.
- Claims: `sub` (user id), `role` (`USER` | `ADMIN`).
- **Every** verification (`apps/api/src/lib/jwt.ts#verifyAccessToken`,
  used by `middleware/auth.ts` on every authenticated request) explicitly
  checks:
  - **algorithm** — `algorithms: ["HS256"]` is passed to `jwt.verify`, so a
    token signed with `alg: none` or a different algorithm is rejected
    outright (this also closes the classic "alg confusion" attack).
  - **issuer** — must equal `JWT_ISSUER`.
  - **audience** — must equal `JWT_AUDIENCE`.
  - **expiration** — `jsonwebtoken` rejects expired tokens by default as
    part of `verify()`; this is not bypassed anywhere.

## Refresh tokens

Refresh tokens are **not** JWTs. They are opaque random values
(`crypto.randomBytes(48).toString("hex")`) returned to the client once;
only a SHA-256 hash of the token is ever stored, in `refresh_tokens.token_hash`
(unique). This means a leaked database dump does not expose usable refresh
tokens, and revocation/rotation is a simple row update rather than
requiring a JWT blocklist.

- **Rotation**: every `/auth/refresh` call marks the presented token
  `revoked_at = now()`, records `replaced_by_token_hash`, and issues a
  brand-new token in the same `family_id`. See
  `apps/api/src/lib/refreshToken.ts#rotateRefreshToken`.
- **Reuse detection**: if an already-revoked token is presented again (a
  strong signal that a refresh token was stolen and the legitimate client
  already rotated past it), the entire token family is revoked
  immediately, invalidating every descendant token, not just the reused
  one.
- **Revocation**: `/auth/logout` revokes the single presented token.
  `revokeAllRefreshTokensForUser` (used for an admin "log out everywhere"
  action) revokes every active token for a user. Both are verified in
  `apps/api/tests/auth.test.ts` by confirming a revoked token is rejected
  on reuse (`401`), not merely by asserting the revoke call didn't throw.
- Lifetime is configurable via `REFRESH_TOKEN_TTL_DAYS` (default 30).

## RBAC

Two roles: `USER`, `ADMIN` (Prisma `Role` enum, default `USER`).
`middleware/auth.ts#requireRole("ADMIN")` returns `403` for an
authenticated non-admin and `401` for an unauthenticated caller.
`GET /admin/stats` is the only Phase 1-2 admin-only route (existing to
prove and test the mechanism — real "system analytics" content is a later
phase). `GET /documents` demonstrates "users can only access their own
documents": it is scoped to `where: { ownerId: req.auth.userId }`, never
by a caller-supplied user id. Both rules are covered in
`apps/api/tests/rbac.test.ts`.

## Secrets

No secret or credential is hardcoded anywhere in source. `JWT_ACCESS_SECRET`
and `JWT_REFRESH_SECRET` are required environment variables (Phase 1-2's
`apps/api/src/config/env.ts` fails fast at startup if either is missing,
too short, or identical to each other). `.env.example` documents every
required variable with a non-functional placeholder value; `.env` itself
is git-ignored (see `.gitignore`).

The database seed script (`packages/db/src/seed.ts`) creates one demo
account for local development; its password is generated with
`crypto.randomBytes` at seed time and printed to the console once — it is
never hardcoded in source and is not a production credential.
