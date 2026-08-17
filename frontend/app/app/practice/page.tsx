import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { LabSummary } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { TopNavServer } from "@/features/dashboard/TopNavServer";

export const metadata = { title: "Practice · Securacy" };

/**
 * Everything not yet finished, newest first. "Learn" is for browsing the
 * catalog; this is for picking up what you already started.
 */
export default async function PracticePage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/practice");

  const labs = (await serverApi<LabSummary[]>("/labs", cookie)) ?? [];
  const inProgress = labs.filter((l) => l.attempt && l.attempt.status !== "completed");
  const notStarted = labs.filter((l) => !l.attempt);

  return (
    <>
      <TopNavServer me={me} cookie={cookie} />
      <main style={{ padding: `0 ${tokens.space(8)} ${tokens.space(8)}`, maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: tokens.size.xxl, fontWeight: 500 }}>Practice</h1>

        <Section title="Pick up where you left off" empty="Nothing in progress right now.">
          {inProgress.map((l) => (
            <Row
              key={l.id}
              href={`/app/labs/${l.slug}`}
              title={l.title}
              meta={`${l.category.name} · ${l.attempt!.currentStep.replace(/_/g, " ")}`}
              cta="Resume"
            />
          ))}
        </Section>

        <Section title="Not started yet" empty="You have opened every lab.">
          {notStarted.map((l) => (
            <Row
              key={l.id}
              href={`/app/labs/${l.slug}`}
              title={l.title}
              meta={`${l.category.name} · ${l.difficulty} · ${l.estimatedMinutes} min`}
              cta="Start"
            />
          ))}
        </Section>
      </main>
    </>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode[]; empty: string }) {
  return (
    <section style={{ marginTop: tokens.space(7) }}>
      <h2 style={{ fontSize: tokens.size.xl, fontWeight: 500 }}>{title}</h2>
      {children.length === 0 ? (
        <p style={{ color: tokens.color.textMuted }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: tokens.space(2) }}>{children}</ul>
      )}
    </section>
  );
}

function Row({ href, title, meta, cta }: { href: string; title: string; meta: string; cta: string }) {
  return (
    <li>
      <Link
        href={href}
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
          <span style={{ display: "block", fontSize: tokens.size.lg }}>{title}</span>
          <span style={{ display: "block", fontSize: tokens.size.sm, color: tokens.color.textMuted, textTransform: "capitalize" }}>
            {meta}
          </span>
        </span>
        <span style={{ color: tokens.color.accentInk, fontSize: tokens.size.base, whiteSpace: "nowrap" }}>{cta} →</span>
      </Link>
    </li>
  );
}
