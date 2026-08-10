import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { LabSummary } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { LabGrid } from "@/features/catalog/LabGrid";

export default async function CategoryPage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  const cookie = (await headers()).get("cookie") ?? undefined;
  const [me, labs] = await Promise.all([
    getMe(cookie),
    serverApi<LabSummary[]>(`/labs?category=${encodeURIComponent(categorySlug)}`, cookie),
  ]);
  if (!labs) notFound();

  return (
    <>
      {me && <AppNav me={me} />}
      <main style={{ padding: tokens.space(6), maxWidth: 1100, margin: "0 auto", color: tokens.color.text }}>
        <Link href="/app/catalog" style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, textDecoration: "none" }}>
          ← All categories
        </Link>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: tokens.space(2) }}>
          {labs[0]?.category.name ?? categorySlug}
        </h1>
        {labs.length === 0 ? (
          <p style={{ color: tokens.color.textMuted }}>No published labs in this category yet.</p>
        ) : (
          <LabGrid labs={labs} />
        )}
      </main>
    </>
  );
}
