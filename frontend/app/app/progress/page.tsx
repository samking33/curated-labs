import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Progress } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { TopNavServer } from "@/features/dashboard/TopNavServer";

export const metadata = { title: "Progress — Securacy" };

const STEP_LABEL: Record<string, string> = {
  intro: "Brief",
  architecture_issues: "Architecture",
  threats: "Threats",
  prioritization: "Priority",
  mitigations: "Mitigations",
  release_decision: "Decision",
  completed: "Completed",
};

export default async function ProgressPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/progress");

  const progress = await serverApi<Progress>("/me/progress", cookie);

  return (
    <>
      <TopNavServer me={me} cookie={cookie} />
      <main style={{ padding: `0 ${tokens.space(8)} ${tokens.space(8)}`, maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ fontSize: tokens.size.xxl, fontWeight: 500 }}>Progress</h1>
        <p style={{ color: tokens.color.textMuted, marginTop: 0 }}>
          Activity and completion. For points and ranking, see the{" "}
          <Link href="/app/leaderboard" style={{ color: tokens.color.accentInk }}>
            leaderboard
          </Link>
          .
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: tokens.space(4),
            margin: `${tokens.space(6)} 0`,
          }}
        >
          <Stat label="Labs started" value={progress?.labsStarted ?? 0} />
          <Stat label="Labs completed" value={progress?.labsCompleted ?? 0} />
          <Stat label="Steps submitted" value={progress?.stepsSubmitted ?? 0} />
        </div>

        <h2 style={{ fontSize: tokens.size.xl, fontWeight: 500 }}>Your attempts</h2>
        {!progress?.recent.length ? (
          <p style={{ color: tokens.color.textMuted }}>
            Nothing yet. <Link href="/app/catalog" style={{ color: tokens.color.accent }}>Browse the catalog</Link>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: tokens.space(2) }}>
            {progress.recent.map((r) => {
              const done = r.status === "completed";
              return (
                <li key={r.attemptId}>
                  <Link
                    href={`/app/labs/${r.labSlug}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: tokens.space(4),
                      padding: tokens.space(5),
                      background: tokens.color.surface,
                      borderRadius: tokens.radius.lg,
                      boxShadow: tokens.shadow.card,
                      color: tokens.color.text,
                      textDecoration: "none",
                    }}
                  >
                    <span>
                      <span style={{ display: "block", fontSize: tokens.size.lg }}>{r.labTitle}</span>
                      <span style={{ display: "block", fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
                        Started {new Date(r.startedAt).toLocaleDateString("en-GB")}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: tokens.size.sm,
                        padding: `${tokens.space(1)} ${tokens.space(3)}`,
                        borderRadius: tokens.radius.pill,
                        whiteSpace: "nowrap",
                        color: done ? tokens.color.success : tokens.color.accent,
                        border: `1px solid ${done ? tokens.color.success : tokens.color.accent}`,
                      }}
                    >
                      {done ? "✓ Completed" : STEP_LABEL[r.currentStep] ?? r.currentStep}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: tokens.space(5),
        background: tokens.color.surface,
        borderRadius: tokens.radius.lg,
        boxShadow: tokens.shadow.card,
      }}
    >
      <div style={{ fontSize: "36px", fontWeight: 600, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>{label}</div>
    </div>
  );
}
