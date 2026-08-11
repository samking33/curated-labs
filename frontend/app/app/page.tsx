import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { Card } from "@/components/ui";

export const metadata = { title: "Securacy" };

/** The fork every session starts from: a guided curated lab, or a
 *  self-described Custom Playground scenario. Progress/activity moved to
 *  /app/dashboard — this is the landing page precisely so it isn't buried
 *  behind a full dashboard on every login. */
export default async function AppHome() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app");
  if (!me.accountKind) redirect("/onboarding");

  return (
    <>
      <AppNav me={me} />
      <main
        style={{
          minHeight: "calc(100vh - 65px)",
          display: "grid",
          placeItems: "center",
          padding: tokens.space(6),
        }}
      >
        <div style={{ maxWidth: 760, width: "100%" }}>
          <h1 style={{ fontSize: tokens.size.xxl, textAlign: "center", marginTop: 0 }}>
            What do you want to work on?
          </h1>
          <p style={{ color: tokens.color.textMuted, textAlign: "center", marginBottom: tokens.space(7) }}>
            Pick a curated lab for a structured walkthrough, or describe your own system in the
            Playground.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: tokens.space(5),
            }}
          >
            <EntryCard
              href="/app/catalog"
              title="Curated labs"
              description="Real architectures with real problems to find, in a guided step-by-step flow."
            />
            <EntryCard
              href="/app/playground"
              title="Custom Playground"
              description="Describe a system you have in mind and an AI builds the scenario for you."
            />
          </div>

          <p style={{ textAlign: "center", marginTop: tokens.space(7) }}>
            <Link href="/app/dashboard" style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
              View your progress and activity →
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

function EntryCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <Card style={{ height: "100%", cursor: "pointer" }}>
        <h2 style={{ margin: 0, fontSize: tokens.size.xl }}>{title}</h2>
        <p style={{ color: tokens.color.textMuted, marginBottom: 0 }}>{description}</p>
      </Card>
    </Link>
  );
}
