import { headers } from "next/headers";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { CategoryGrid, type Category } from "@/features/catalog/CategoryGrid";

export const metadata = { title: "Catalog — Curated Labs" };

/** Categories first, labs second — the browse path the product describes. */
export default async function CatalogPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const [me, categories] = await Promise.all([
    getMe(cookie),
    serverApi<Category[]>("/lab-categories", cookie),
  ]);

  return (
    <>
      {me && <AppNav me={me} />}
      <main style={{ padding: tokens.space(6), maxWidth: 1100, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>Lab catalog</h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: tokens.space(6) }}>
          Pick a track, then work through its labs. Each one is a real architecture with real
          problems to find.
        </p>

        {categories === null ? (
          <p style={{ color: tokens.color.danger }}>Could not load the catalog. Is the API running?</p>
        ) : categories.length === 0 ? (
          <p style={{ color: tokens.color.textMuted }}>No categories published yet.</p>
        ) : (
          <CategoryGrid categories={categories} />
        )}
      </main>
    </>
  );
}
