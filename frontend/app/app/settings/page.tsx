import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";

export const metadata = { title: "Settings — Curated Labs" };

export default async function SettingsPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/settings");

  return (
    <>
      <AppNav me={me} />
      <main style={{ padding: tokens.space(6), maxWidth: 640, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>Settings</h1>

        <section style={{ marginBottom: tokens.space(6) }}>
          <h2 style={{ fontSize: tokens.size.lg }}>Account</h2>
          <Row label="Name" value={me.user.name} />
          <Row label="Email" value={me.user.email} />
          <Row label="Account type" value={me.accountKind ?? "not set"} />
          <p style={{ color: tokens.color.textFaint, fontSize: tokens.size.xs }}>
            Your profile comes from Google. Change it there and sign in again to refresh it.
          </p>
        </section>

        <section style={{ marginBottom: tokens.space(6) }}>
          <h2 style={{ fontSize: tokens.size.lg }}>Organizations</h2>
          {me.organizations.length === 0 ? (
            <p style={{ color: tokens.color.textMuted }}>You are not a member of any organization.</p>
          ) : (
            me.organizations.map((o) => <Row key={o.id} label={o.name} value={o.role.replace(/_/g, " ")} />)
          )}
        </section>

        <section>
          <h2 style={{ fontSize: tokens.size.lg }}>Your data</h2>
          <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
            We store your name, email and lab activity. To have your account disabled and your
            personal data removed, contact your platform administrator.
          </p>
        </section>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: `${tokens.space(2)} 0`, borderBottom: `1px solid ${tokens.color.border}` }}>
      <span style={{ color: tokens.color.textMuted }}>{label}</span>
      <span style={{ textTransform: "capitalize" }}>{value}</span>
    </div>
  );
}
