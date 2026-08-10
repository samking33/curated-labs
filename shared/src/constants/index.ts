/** Tunables referenced by both sides. */

/** §8 step 2: learner gets this many tries before the canonical set is shown. */
export const THREAT_RETRY_LIMIT = 2;

/** §12 session cookie. */
export const SESSION_COOKIE = "cl_session";
export const CSRF_COOKIE = "cl_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 8;
export const SESSION_ABSOLUTE_MS = 1000 * 60 * 60 * 24 * 7;

export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export const LAB_CATEGORIES = ["app-security", "privacy", "ai-security", "cloud-security"] as const;

/**
 * Postgres throws on a non-UUID literal compared against a uuid column, which
 * surfaces as a 500 rather than a not-found. Every lookup that accepts either a
 * slug or an id must gate the id branch on this.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
