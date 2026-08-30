import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // env vars (DATABASE_URL, JWT secrets) are injected by `dotenv -e ../../.env --`
    // in package.json's "test" script, not loaded here.
    // Auth/RBAC tests share one real Postgres connection and mutate shared
    // tables (users, refresh_tokens) - run serially to avoid cross-test
    // interference instead of relying on per-test transactions.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
