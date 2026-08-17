import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { LeaderboardResponse } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { TopNavServer } from "@/features/dashboard/TopNavServer";
import { LeaderboardView } from "@/features/leaderboard/LeaderboardView";

export const metadata = { title: "Leaderboard · Securacy" };

const EMPTY: LeaderboardResponse = { scope: "global", entries: [], self: null };

export default async function LeaderboardPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/leaderboard");

  const org = me.organizations[0];
  const [global, organization] = await Promise.all([
    serverApi<LeaderboardResponse>("/leaderboard", cookie),
    org ? serverApi<LeaderboardResponse>(`/organizations/${org.id}/leaderboard`, cookie) : Promise.resolve(null),
  ]);

  return (
    <>
      <TopNavServer me={me} cookie={cookie} />
      <main style={{ padding: `0 ${tokens.space(8)} ${tokens.space(8)}`, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: tokens.size.xxl, fontWeight: 500 }}>Leaderboard</h1>
        <p style={{ color: tokens.color.textMuted, marginTop: 0 }}>
          Points are calculated based on the Coach&apos;s assessment of threats identified,
          prioritization, and mitigations mapped, with additional points awarded for completing each
          step.
        </p>

        <LeaderboardView global={global ?? EMPTY} organization={organization} orgName={org?.name} />
      </main>
    </>
  );
}
