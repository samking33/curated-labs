import type { MeResponse } from "@curated-labs/shared";
import { API_BASE } from "./api";

/**
 * Server-side session read. Cookies are forwarded explicitly because a server
 * component fetch does not inherit the browser's cookie jar.
 */
export async function getMe(cookieHeader: string | undefined): Promise<MeResponse | null> {
  if (!cookieHeader) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    // API down: treat as signed out rather than crashing the page render.
    return null;
  }
}
