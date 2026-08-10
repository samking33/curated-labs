import type { ApiError } from "@curated-labs/shared";

/**
 * Where to reach the API.
 *
 * Server-side (SSR, server components) goes straight to the backend on the
 * loopback address — no proxy hop needed inside the same machine.
 *
 * In the browser this is the empty string, making every request relative to
 * whatever origin the page was served from. That is what lets the app work
 * behind a tunnel or any other hostname: the browser never needs to know the
 * backend exists, and the session cookie is always first-party.
 */
export const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_ORIGIN ?? "http://localhost:4000")
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "");
const PREFIX = "/api/v1";

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/** Reads the CSRF cookie the API sets. Not httpOnly precisely so we can echo it. */
function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("cl_csrf="))
    ?.split("=")[1];
}

/**
 * Single fetch wrapper for the API.
 *
 * `credentials: "include"` everywhere — auth is a cookie, and the app is served
 * from a different origin than the API in every environment. The CSRF header is
 * attached on mutations to satisfy the double-submit check.
 */
export async function api<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...init } = options;
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers.set("x-csrf-token", token);
  }
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

  const response = await fetch(`${API_BASE}${PREFIX}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = body as ApiError | null;
    throw new ApiRequestError(
      err?.error?.code ?? "INTERNAL",
      err?.error?.message ?? `Request failed (${response.status}).`,
      response.status,
      err?.error?.requestId,
    );
  }
  return body as T;
}

/** Stable key so a retried submit is de-duplicated server-side (§25). */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
