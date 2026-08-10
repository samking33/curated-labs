import { API_BASE } from "./api";

/** Server-component fetch for public catalog data. Never sends credentials. */
export async function serverApi<T>(path: string, cookieHeader?: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
