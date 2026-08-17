import { Inject, Injectable, Logger } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config";

export class AnthropicUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export type AnthropicChatRequest = {
  system: string;
  user: string;
  maxTokens: number;
  /** Absolute epoch ms: the request is aborted if it would run past this. */
  deadline?: number;
};

export type AnthropicChatResponse = {
  text: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** "max_tokens" means the response was cut off mid-generation: the
   *  caller's JSON almost certainly won't parse, and raising maxTokens (not
   *  retrying) is the fix. */
  stopReason?: string;
};

const ANTHROPIC_VERSION = "2023-06-01";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Playground scenario generation only (PLAYGROUND_PROJECT.md). NIM's
 * multi-model fallback chain was unreliable for this specific task (the one
 * model good enough for it routinely timed out under NIM's per-attempt
 * ceiling, and the weaker fallbacks it fell through to couldn't reliably
 * produce valid schema). Every other AI call in the app still goes through
 * NimClient: this class deliberately does not touch that path.
 */
@Injectable()
export class AnthropicClient {
  private readonly logger = new Logger(AnthropicClient.name);

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return this.config.anthropicConfigured;
  }

  async chat(request: AnthropicChatRequest): Promise<AnthropicChatResponse> {
    if (!this.configured) throw new AnthropicUnavailableError("Anthropic is not configured.", "NOT_CONFIGURED");

    const remaining = request.deadline ? request.deadline - Date.now() : Infinity;
    if (remaining <= 500) throw new AnthropicUnavailableError("Out of time budget for this task.", "DEADLINE");
    const timeoutMs = Math.min(remaining, 170_000);

    const started = Date.now();
    let lastError: Error = new AnthropicUnavailableError("Anthropic request failed.", "UNKNOWN");

    // One retry on a transient failure only: a single scenario-generation
    // call already costs real money and a couple of minutes; anything more
    // belongs to the caller's own repair-attempt loop, not this client.
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        let response: Response;
        try {
          response = await fetch(`${this.config.ANTHROPIC_BASE_URL}/v1/messages`, {
            method: "POST",
            headers: {
              "x-api-key": this.config.ANTHROPIC_API_KEY,
              "anthropic-version": ANTHROPIC_VERSION,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: this.config.ANTHROPIC_MODEL,
              max_tokens: request.maxTokens,
              system: request.system,
              messages: [{ role: "user", content: request.user }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          const timedOut = (err as Error).name === "TimeoutError";
          throw new AnthropicUnavailableError(
            timedOut ? `Anthropic timed out after ${timeoutMs}ms.` : "Could not reach Anthropic.",
            timedOut ? "TIMEOUT" : "NETWORK",
          );
        }

        if (!response.ok) {
          const detail = (await response.text().catch(() => "")).slice(0, 200);
          const error = new AnthropicUnavailableError(`Anthropic returned ${response.status}.`, `HTTP_${response.status}`);
          (error as AnthropicUnavailableError & { status?: number }).status = response.status;
          this.logger.warn({ status: response.status, detail }, "Anthropic error response");
          throw error;
        }

        const json = (await response.json()) as {
          content?: { type: string; text?: string }[];
          model?: string;
          stop_reason?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = (json.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("")
          .trim();
        if (!text) throw new AnthropicUnavailableError("Model returned an empty response.", "EMPTY_RESPONSE");

        return {
          text,
          model: json.model ?? this.config.ANTHROPIC_MODEL,
          latencyMs: Date.now() - started,
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
          stopReason: json.stop_reason,
        };
      } catch (err) {
        lastError = err as Error;
        const status = (err as { status?: number }).status;
        const code = err instanceof AnthropicUnavailableError ? err.code : "UNKNOWN";
        const retryable = code === "NETWORK" || (status !== undefined && RETRYABLE_STATUS.has(status));
        if (!retryable || attempt === 1) break;
        await sleep(500);
      }
    }
    throw lastError;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
