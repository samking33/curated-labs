import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { CONFIG, type AppConfig } from "../../config";

export class NimUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  model: string;
  system: string;
  user: string;
  /**
   * Earlier turns, oldest first, inserted between the system prompt and
   * `user`. The evaluator paths are single-shot and leave this empty; the
   * assistant needs it so follow-up questions keep their context.
   */
  history?: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt HTTP timeout override: defaults to AI_TIMEOUT_MS. Callers
   *  with a slower workload than interactive coaching (scenario generation)
   *  need this raised, or every attempt times out regardless of how much
   *  overall `deadline` budget remains. */
  attemptTimeoutMs?: number;
};

export type ChatResponse = {
  text: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

/** Retrying a 400 just burns quota; only transient classes are worth a retry. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Error codes that are NOT worth retrying with the same request.
 *
 * TIMEOUT is the important one: the prompt was too slow to process, and sending
 * the identical prompt again will be slow again. Retrying it three times turned
 * one 30 s timeout into a 90 s stall: and because the caller then falls through
 * to the next model, a single step submission could burn several minutes.
 */
const TERMINAL_CODES = new Set(["TIMEOUT", "NOT_CONFIGURED", "EMPTY_RESPONSE"]);

/**
 * The only place in the system that talks to the model provider.
 *
 * OpenAI and NVIDIA NIM speak the same chat/completions dialect, so which one
 * answers is a matter of configuration rather than of code. The provider is
 * resolved once in loadConfig().
 *
 * The API key never leaves this class and is never logged. Callers get either a
 * validated response or NimUnavailableError: they must not see raw HTTP.
 */
@Injectable()
export class NimClient {
  private readonly logger = new Logger(NimClient.name);

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.aiApiKey);
  }

  /** Stable hash of a request, for the ai_calls dedupe index and caching. */
  static requestHash(input: { model: string; system: string; user: string; promptVersion: string }): string {
    return createHash("sha256")
      .update([input.promptVersion, input.model, input.system, input.user].join("\u0000"))
      .digest("hex");
  }

  async ping(): Promise<void> {
    await this.fetchJson("/models", { method: "GET" }, 5000);
  }

  /**
   * Chat completion with bounded exponential backoff. Total attempts is
   * AI_RETRY_COUNT + 1; the timeout applies per attempt, not to the whole call.
   */
  async chat(request: ChatRequest & { deadline?: number }): Promise<ChatResponse> {
    if (!this.configured) throw new NimUnavailableError("No AI provider is configured.", "NOT_CONFIGURED");

    const body = {
      model: request.model,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? this.config.AI_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: request.system },
        ...(request.history ?? []),
        { role: "user", content: request.user },
      ],
    };

    let lastError: Error = new NimUnavailableError("NIM request failed.", "UNKNOWN");

    for (let attempt = 0; attempt <= this.config.AI_RETRY_COUNT; attempt++) {
      const started = Date.now();

      // Never start an attempt that cannot finish inside the caller's budget.
      const remaining = request.deadline ? request.deadline - Date.now() : Infinity;
      if (remaining <= 500) {
        throw new NimUnavailableError("Out of time budget for this task.", "DEADLINE");
      }
      const attemptTimeout = Math.min(request.attemptTimeoutMs ?? this.config.AI_TIMEOUT_MS, remaining);

      try {
        const json = (await this.fetchJson(
          "/chat/completions",
          { method: "POST", body: JSON.stringify(body) },
          attemptTimeout,
        )) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        // Reasoning models can spend the whole budget on hidden thinking and
        // return nothing; that is a failure, not an empty answer.
        if (!text) throw new NimUnavailableError("Model returned an empty response.", "EMPTY_RESPONSE");

        return {
          text,
          model: request.model,
          latencyMs: Date.now() - started,
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
        };
      } catch (err) {
        lastError = err as Error;
        const status = (err as { status?: number }).status;
        const code = err instanceof NimUnavailableError ? err.code : "UNKNOWN";

        // A timeout or an empty completion will repeat given the same prompt:
        // move on to the next model instead of paying the budget again.
        if (TERMINAL_CODES.has(code)) break;

        const retryable = status === undefined || RETRYABLE_STATUS.has(status);
        if (!retryable || attempt === this.config.AI_RETRY_COUNT) break;
        // 250ms, 500ms, 1s… enough to ride out a rate limit without stalling
        // the learner behind a long wall of retries.
        await sleep(250 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  async embed(input: string[], model = this.config.NVIDIA_NIM_MODEL_EMBEDDING): Promise<number[][]> {
    const json = (await this.fetchJson(
      "/embeddings",
      {
        method: "POST",
        body: JSON.stringify({ model, input, input_type: "query", encoding_format: "float" }),
      },
      this.config.AI_TIMEOUT_MS,
    )) as { data?: { embedding: number[] }[] };
    return (json.data ?? []).map((d) => d.embedding);
  }

  private async fetchJson(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.config.aiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.aiApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError";
      throw new NimUnavailableError(
        timedOut ? `${this.config.aiProvider} timed out after ${timeoutMs}ms.` : `Could not reach ${this.config.aiProvider}.`,
        timedOut ? "TIMEOUT" : "NETWORK",
      );
    }

    if (!response.ok) {
      // Body may contain the prompt echoed back: truncate, never log the key.
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      const error = new NimUnavailableError(`${this.config.aiProvider} returned ${response.status}.`, `HTTP_${response.status}`);
      (error as NimUnavailableError & { status?: number }).status = response.status;
      this.logger.warn({ provider: this.config.aiProvider, status: response.status, path, detail }, "AI error response");
      throw error;
    }
    return response.json();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
