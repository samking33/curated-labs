import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";

type OrgProgress = {
  totals: { attempts: number; completed: number; learners: number };
  attempts: {
    attemptId: string;
    learner: { id: string; name: string; email: string };
    department: { id: string; name: string } | null;
    labTitle: string;
    status: string;
    currentStep: string;
    startedAt: string;
  }[];
};

/** §11: operational visibility for admins. Explicitly not a formal report. */
export default async function OrgPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect(`/login?returnTo=/app/org/${orgSlug}`);

  const org = me.organizations.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const progress = await serverApi<OrgProgress>(`/organizations/${org.id}/progress`, cookie);

  return (
    <>
      <AppNav me={me} />
      <main style={{ padding: tokens.space(6), maxWidth: 1100, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>{org.name}</h1>
        <div style={{ display: "flex", gap: tokens.space(3), marginBottom: tokens.space(5) }}>
          <Link href={`/app/org/${orgSlug}/members`} style={{ color: tokens.color.accent }}>Members</Link>
          <Link href={`/app/org/${orgSlug}/departments`} style={{ color: tokens.color.accent }}>Departments</Link>
        </div>

        {!progress ? (
          <p style={{ color: tokens.color.textMuted }}>You do not have access to organization activity.</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: tokens.space(3) }}>
              <Stat label="Attempts" value={progress.totals.attempts} />
              <Stat label="Completed" value={progress.totals.completed} />
              <Stat label="Active learners" value={progress.totals.learners} />
            </div>
            <p style={{ color: tokens.color.textFaint, fontSize: tokens.size.xs }}>
              Completion and activity only. No scores, rankings or pass/fail outcomes.
            </p>

            <h2 style={{ fontSize: tokens.size.xl, marginTop: tokens.space(6) }}>Recent activity</h2>
            {progress.attempts.length === 0 ? (
              <p style={{ color: tokens.color.textMuted }}>Nobody has started a lab yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: tokens.size.sm }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: tokens.color.textMuted }}>
                      <Th>Learner</Th><Th>Department</Th><Th>Lab</Th><Th>Status</Th><Th>Started</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.attempts.map((a) => (
                      <tr key={a.attemptId} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                        <Td>{a.learner.name}</Td>
                        <Td>{a.department?.name ?? "—"}</Td>
                        <Td>{a.labTitle}</Td>
                        <Td>{a.status === "completed" ? "Completed" : a.currentStep.replace(/_/g, " ")}</Td>
                        <Td>{new Date(a.startedAt).toLocaleDateString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: tokens.space(4), border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg, background: tokens.color.surface }}>
      <div style={{ fontSize: tokens.size.xxl, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>{label}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: tokens.space(2), fontWeight: 500 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: tokens.space(2) }}>{children}</td>;
}
