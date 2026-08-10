import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMe } from "@/lib/session";
import { tokens } from "@/lib/tokens";
import { TopNavServer } from "@/features/dashboard/TopNavServer";

export const metadata = { title: "Live Classes — Securacy" };

/**
 * Live sessions are not part of this build (PROJECT.md §1 scopes it to curated
 * labs). The route exists so the nav item is honest rather than a dead link.
 */
export default async function LivePage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/live");

  return (
    <>
      <TopNavServer me={me} cookie={cookie} />
      <main style={{ padding: `0 ${tokens.space(8)} ${tokens.space(8)}`, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: tokens.size.xxl, fontWeight: 500 }}>Live Classes</h1>
        <div
          style={{
            padding: tokens.space(6),
            background: tokens.color.surface,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.card,
          }}
        >
          <p style={{ margin: 0, fontSize: tokens.size.lg }}>Not available yet.</p>
          <p style={{ color: tokens.color.textMuted, lineHeight: 1.6 }}>
            Scheduled sessions with an instructor are planned but not part of this build — the
            current release covers self-paced curated labs only.
          </p>
          <Link href="/app/catalog" style={{ color: tokens.color.accent }}>
            Browse curated labs instead →
          </Link>
        </div>
      </main>
    </>
  );
}
