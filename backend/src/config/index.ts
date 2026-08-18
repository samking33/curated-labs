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

  /**
   * OpenAI, used for every model call when set. NVIDIA NIM speaks the same
   * chat/completions dialect, so one client covers both and the provider is
   * chosen here rather than in the code that asks for coaching.
   */
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  /**
   * Measured on real lab prompts rather than picked by size, the same way the
   * NIM choices below were: gpt-4.1 answered in ~2.3s, gpt-4o-mini in ~3.0s
   * and gpt-4.1-mini in ~5.0s, all returning valid JSON. The gpt-5 family
   * spends its whole token budget on hidden reasoning and returns an empty
   * message, so it is not a candidate at these ceilings.
   */
  OPENAI_MODEL_REASONING: z.string().default("gpt-4.1"),
  OPENAI_MODEL_JSON: z.string().default("gpt-4.1-mini"),
  OPENAI_MODEL_FAST: z.string().default("gpt-4o-mini"),
  /** Authoring a whole scenario: ~29s and correctly shaped on gpt-4.1. */
  OPENAI_MODEL_AUTHOR: z.string().default("gpt-4.1"),

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
   * tune: the per-attempt timeout only bounds a single request.
   */
  AI_TASK_BUDGET_MS: z.coerce.number().int().default(45000),

  /**
   * Dev-only bypass so the lab workflow can be exercised (and E2E tested)
   * without Google credentials. Refused outside development: see below.
   */
  ALLOW_DEV_LOGIN: z.coerce.boolean().default(false),

  /**
   * Shared secret for dev login. Required whenever dev login is on and the
   * deployment is reachable over the internet: without it, anyone who can
   * guess an email address signs in as that person, including an
   * organization owner. Left empty for local work, where the listener is not
   * public and E2E runs need no passcode.
   */
  DEV_LOGIN_PASSCODE: z.string().default(""),

  /**
   * Scenario generation is a distinct workload from coaching calls: it needs
   * nemotron-3-super-120b-a12b specifically (benchmarked: it's the only
   * candidate model that reliably returns a valid full scenario), which runs
   * ~85s and ~6-7k output tokens, far past AI_TASK_BUDGET_MS/AI_MAX_OUTPUT_TOKENS.
   * Hence separate budget/token ceilings, used only by generateScenario().
   */
  PLAYGROUND_GEN_MAX_OUTPUT_TOKENS: z.coerce.number().int().default(12000),
  PLAYGROUND_GEN_BUDGET_MS: z.coerce.number().int().default(150000),
  /**
   * Without this, NimClient's per-attempt timeout falls back to the generic
   * AI_TIMEOUT_MS (25s): far below what nemotron-3-super-120b-a12b actually
   * needs, so the one model benchmarked to reliably return a valid scenario
   * would time out on literally every attempt and every job would silently
   * fall back to weaker models that this task's own comment says aren't
   * reliable for it. Set close to (not equal to) PLAYGROUND_GEN_BUDGET_MS: the
   * good model should get nearly the whole budget on each of its two
   * attempts (per PlaygroundGenerationService.runJob) rather than being cut
   * short to leave time for weaker fallbacks that rarely help this task.
   */
  PLAYGROUND_GEN_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().default(140000),

  /** Rolling-window generation quotas, enforced by counting job rows. */
  PLAYGROUND_GEN_PER_USER: z.coerce.number().int().default(10),
  PLAYGROUND_GEN_PER_ORG: z.coerce.number().int().default(50),
  PLAYGROUND_QUOTA_WINDOW_HOURS: z.coerce.number().int().default(24),

  /** A job stuck "running" past this long is reaped back to "failed". */
  PLAYGROUND_STALE_JOB_MS: z.coerce.number().int().default(300000),

  /** Playground scenario generation only (AnthropicClient). NIM's
   *  fallback chain was unreliable for this specific task. Every other AI
   *  call still goes through NimClient. */
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  ANTHROPIC_BASE_URL: z.string().default("https://api.anthropic.com"),

  /**
   * Set by the hosted entry point (server.cjs), which only ever runs on a
   * public deployment. Transport hardening has to key off this rather than
   * NODE_ENV: the host forces NODE_ENV=development so ALLOW_DEV_LOGIN can
   * stay on, and that silently disabled Secure cookies, HSTS and error
   * redaction on a public HTTPS site.
   */
  PUBLIC_DEPLOYMENT: z.coerce.boolean().default(false),
});

export type AppConfig = z.infer<typeof schema> & {
  isProduction: boolean;
  /** Served to the public over TLS: harden transport regardless of NODE_ENV. */
  isHardened: boolean;
  googleConfigured: boolean;
  nimConfigured: boolean;
  anthropicConfigured: boolean;

  /** Which provider answers chat calls, resolved once from the keys present. */
  aiProvider: "openai" | "nim";
  aiApiKey: string;
  aiBaseUrl: string;
  aiModels: { reasoning: string; json: string; fast: string; author: string };
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
  // NODE_ENV alone does not settle this: the hosted entry point sets
  // development so dev login can run at all, so key the requirement off
  // whether the deployment is actually exposed.
  const hardened = cfg.NODE_ENV === "production" || cfg.PUBLIC_DEPLOYMENT || cfg.WEB_APP_URL.startsWith("https://");
  if (cfg.ALLOW_DEV_LOGIN && hardened && cfg.DEV_LOGIN_PASSCODE.length < 12) {
    throw new Error(
      "ALLOW_DEV_LOGIN is on for a publicly reachable deployment, so DEV_LOGIN_PASSCODE must be set to at least 12 characters",
    );
  }

  return {
    ...cfg,
    isProduction: cfg.NODE_ENV === "production",
    isHardened: hardened,
    googleConfigured: Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
    nimConfigured: Boolean(cfg.NVIDIA_NIM_API_KEY),
    anthropicConfigured: Boolean(cfg.ANTHROPIC_API_KEY),

    // One provider for every chat call. OpenAI wins when it has a key, so a
    // deployment switches by setting one variable rather than by a release.
    aiProvider: cfg.OPENAI_API_KEY ? ("openai" as const) : ("nim" as const),
    aiApiKey: cfg.OPENAI_API_KEY || cfg.NVIDIA_NIM_API_KEY,
    aiBaseUrl: cfg.OPENAI_API_KEY ? cfg.OPENAI_BASE_URL : cfg.NVIDIA_NIM_BASE_URL,
    aiModels: cfg.OPENAI_API_KEY
      ? {
          reasoning: cfg.OPENAI_MODEL_REASONING,
          json: cfg.OPENAI_MODEL_JSON,
          fast: cfg.OPENAI_MODEL_FAST,
          author: cfg.OPENAI_MODEL_AUTHOR,
        }
      : {
          reasoning: cfg.NVIDIA_NIM_MODEL_REASONING,
          json: cfg.NVIDIA_NIM_MODEL_JSON,
          fast: cfg.NVIDIA_NIM_MODEL_FAST,
          author: "",
        },
  };
}

export const CONFIG = Symbol("APP_CONFIG");
