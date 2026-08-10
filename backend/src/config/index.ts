import { z } from "zod";

/**
 * Fail fast on bad configuration: a missing SESSION_SECRET in production is a
 * security hole, not a runtime surprise. Parsed once at boot.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),

  DATABASE_URL: z.string().min(1),

  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:4000/api/v1/auth/google/callback"),

  SESSION_SECRET: z.string().min(16),

  NVIDIA_NIM_API_KEY: z.string().default(""),
  NVIDIA_NIM_BASE_URL: z.string().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_NIM_MODEL_REASONING: z.string().default("nvidia/nemotron-3-super-120b-a12b"),
  NVIDIA_NIM_MODEL_JSON: z.string().default("openai/gpt-oss-20b"),
  NVIDIA_NIM_MODEL_FAST: z.string().default("meta/llama-3.1-8b-instruct"),
  NVIDIA_NIM_MODEL_EMBEDDING: z.string().default("nvidia/nv-embedqa-e5-v5"),
  AI_MODEL_AUTO_SELECT: z.coerce.boolean().default(true),
  AI_MAX_INPUT_TOKENS: z.coerce.number().int().default(12000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().default(1200),
  /** Per-attempt timeout for one NIM request. */
  AI_TIMEOUT_MS: z.coerce.number().int().default(25000),
  AI_RETRY_COUNT: z.coerce.number().int().default(1),
  /**
   * Ceiling for a whole coaching task, across every retry and every fallback
   * model. This is what a learner actually waits on, so it is the number to
   * tune — the per-attempt timeout only bounds a single request.
   */
  AI_TASK_BUDGET_MS: z.coerce.number().int().default(45000),

  /**
   * Dev-only bypass so the lab workflow can be exercised (and E2E tested)
   * without Google credentials. Refused outside development — see below.
   */
  ALLOW_DEV_LOGIN: z.coerce.boolean().default(false),

  /**
   * Scenario generation is a distinct workload from coaching calls: it needs
   * nemotron-3-super-120b-a12b specifically (benchmarked — it's the only
   * candidate model that reliably returns a valid full scenario), which runs
   * ~85s and ~6-7k output tokens, far past AI_TASK_BUDGET_MS/AI_MAX_OUTPUT_TOKENS.
   * Hence separate budget/token ceilings, used only by generateScenario().
   */
  PLAYGROUND_GEN_MAX_OUTPUT_TOKENS: z.coerce.number().int().default(6000),
  PLAYGROUND_GEN_BUDGET_MS: z.coerce.number().int().default(150000),

  /** Rolling-window generation quotas, enforced by counting job rows. */
  PLAYGROUND_GEN_PER_USER: z.coerce.number().int().default(10),
  PLAYGROUND_GEN_PER_ORG: z.coerce.number().int().default(50),
  PLAYGROUND_QUOTA_WINDOW_HOURS: z.coerce.number().int().default(24),

  /** A job stuck "running" past this long is reaped back to "failed". */
  PLAYGROUND_STALE_JOB_MS: z.coerce.number().int().default(300000),
});

export type AppConfig = z.infer<typeof schema> & {
  isProduction: boolean;
  googleConfigured: boolean;
  nimConfigured: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${detail}`);
  }
  const cfg = parsed.data;

  // A dev bypass that survives into production would be a full auth bypass.
  if (cfg.ALLOW_DEV_LOGIN && cfg.NODE_ENV === "production") {
    throw new Error("ALLOW_DEV_LOGIN must never be enabled in production");
  }
  if (cfg.NODE_ENV === "production" && cfg.SESSION_SECRET.includes("replace-with")) {
    throw new Error("SESSION_SECRET is still the placeholder value");
  }

  return {
    ...cfg,
    isProduction: cfg.NODE_ENV === "production",
    googleConfigured: Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
    nimConfigured: Boolean(cfg.NVIDIA_NIM_API_KEY),
  };
}

export const CONFIG = Symbol("APP_CONFIG");
