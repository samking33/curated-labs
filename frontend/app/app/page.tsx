import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MyPointsResponse, Progress } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { Dashboard } from "@/features/dashboard/Dashboard";

export const metadata = { title: "Dashboard — Securacy" };

type Member = { name: string; avatarUrl: string | null };

export default async function AppHome() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app");
  if (!me.accountKind) redirect("/onboarding");

  const progress = await serverApi<Progress>("/me/progress", cookie);
  const myPoints = await serverApi<MyPointsResponse>("/me/points", cookie);

  // Real faces when the learner is in an organization; otherwise the panel
  // still renders with placeholders rather than collapsing.
  const org = me.organizations[0];
  const members = org ? await serverApi<Member[]>(`/organizations/${org.id}/members`, cookie) : null;
  const learners = (members ?? []).slice(0, 3);
  while (learners.length < 3) learners.push({ name: ["Ana", "Bo", "Cy"][learners.length]!, avatarUrl: null });

  /**
   * Activity bucketed by month for each range the selector offers. Computed
   * once here so switching range is instant and needs no round trip.
   *
   * `now` is read once, on the server, and everything date-shaped derives from
   * it — including the `today` passed to the client, so SSR and hydration
   * cannot disagree.
   */
  const now = new Date();
  const recent = progress?.recent ?? [];
  const bucket = (monthsBack: number) =>
    Array.from({ length: monthsBack }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
      return {
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        value: recent.filter((r) => {
          const s = new Date(r.startedAt);
          return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth();
        }).length,
      };
    });

  const monthsByRange = {
    month: bucket(3),
    quarter: bucket(3),
    all: bucket(6),
  };
  // Give the chart shape before there is history, so the card is never empty.
  for (const key of ["month", "quarter", "all"] as const) {
    const bars = monthsByRange[key];
    if (bars.every((b) => b.value === 0)) {
      bars.forEach((b, i) => (b.value = i + 1));
    }
  }

  // Computed here, in a server component, and passed down — see HeroHeader.
  const today = {
    day: now.getDate(),
    weekday: now.toLocaleDateString("en-GB", { weekday: "short" }),
    month: now.toLocaleDateString("en-GB", { month: "long" }),
    weekdayIndex: now.getDay(),
  };

  return (
    <Dashboard
      me={me}
      progress={progress}
      monthsByRange={monthsByRange}
      learners={learners}
      today={today}
      points={myPoints?.total ?? null}
      // Frozen server time, not a live clock — see lib/format.ts on why a
      // client-side `Date.now()` read here would risk a hydration mismatch.
      nowIso={now.toISOString()}
    />
  );
}
