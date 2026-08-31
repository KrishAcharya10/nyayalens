import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  ARGON2_MEMORY_COST_KIB: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  // Local-disk storage adapter root, relative to the API process's cwd
  // unless absolute. See apps/api/src/storage/.
  STORAGE_ROOT: z.string().min(1).default("storage"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(20),

  // Path to the Python interpreter inside services/ml/.venv, used to run
  // the generic-transformer NER baseline as a subprocess. Empty string =
  // the generic_transformer stage is skipped (logged, not silently
  // dropped) - lets the rest of the pipeline run in environments where
  // the ML venv hasn't been set up (see services/ml/README.md).
  ML_SERVICE_PYTHON: z.string().default(""),

  // Phase 7A: which LLMProvider answers /documents/:id/ask questions.
  // "extractive" (default) is the verified-working implementation - see
  // docs/architecture/rag_design.md. "anthropic" activates
  // AnthropicProvider only if ANTHROPIC_API_KEY is also set; otherwise the
  // factory falls back to "extractive" with a logged warning rather than
  // failing startup, since no key is configured in this environment.
  LLM_PROVIDER: z.enum(["extractive", "anthropic"]).default("extractive"),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20241022"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.format());
    throw new Error("Invalid environment configuration - see .env.example");
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values");
  }
  return parsed.data;
}

export const env = loadEnv();
