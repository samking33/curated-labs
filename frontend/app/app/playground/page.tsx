import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { LabSummary } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { LabGrid } from "@/features/catalog/LabGrid";
import { GenerateForm } from "@/features/playground/GenerateForm";

export const metadata = { title: "Custom Playground · Securacy" };

export default async function PlaygroundPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/app/playground");

  const scenarios = await serverApi<LabSummary[]>("/playground/scenarios", cookie);

  return (
    <>
      <AppNav me={me} />
      <main style={{ padding: tokens.space(6), maxWidth: 1100, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>Custom Playground</h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: tokens.space(6) }}>
          Describe a system you have in mind and work through the same guided exercise as the curated
          labs. An AI builds the scenario, so treat its rubric as a first draft, not a verdict.
        </p>

        <GenerateForm />

        {scenarios === null ? (
          <p style={{ color: tokens.color.danger }}>Could not load your scenarios. Is the API running?</p>
        ) : (
          <LabGrid labs={scenarios} hrefBase="/app/playground" emptyLabel="No scenarios yet. Describe a system above to generate one." />
        )}
      </main>
    </>
  );
}
