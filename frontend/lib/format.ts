/**
 * Both arguments must be frozen values (already-computed Dates, not fresh
 * `Date.now()` reads): passing a live clock read here from a client component
 * is exactly what causes hydration mismatches: the server and the browser
 * render this function microseconds-to-seconds apart, and a live read would
 * make each side may compute a different bucket ("2 minutes ago" vs
 * "3 minutes ago"). Callers get `now` from a server-computed prop instead.
 */
export function formatTimeAgo(now: Date, then: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
