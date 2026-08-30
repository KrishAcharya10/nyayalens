import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // env vars (DATABASE_URL) are injected by `dotenv -e ../../.env --`
    // in package.json's "test" script, not loaded here.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
