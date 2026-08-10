import type { MeResponse, MyPointsResponse } from "@curated-labs/shared";
import { serverApi } from "@/lib/server-api";
import { TopNav } from "./Chrome";

/**
 * Thin server wrapper so pages can render the nav without each becoming a
 * client component just to hold a callback.
 *
 * `cookie` is optional so existing call sites keep compiling without the
 * points badge; passing it turns the badge on. Fetch failure hides the badge
 * rather than showing a stale or fake number.
 */
export async function TopNavServer({ me, cookie }: { me: MeResponse; cookie?: string }) {
  const points = cookie ? await serverApi<MyPointsResponse>("/me/points", cookie) : null;
  return <TopNav name={me.user.name} avatarUrl={me.user.avatarUrl} points={points?.total ?? null} />;
}
