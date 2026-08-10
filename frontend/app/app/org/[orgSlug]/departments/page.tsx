import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { DepartmentsManager, type Department } from "@/features/org/DepartmentsManager";

export default async function DepartmentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect(`/login?returnTo=/app/org/${orgSlug}/departments`);

  const org = me.organizations.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const departments = await serverApi<Department[]>(`/organizations/${org.id}/departments`, cookie);

  return (
    <>
      <AppNav me={me} />
      <main style={{ padding: tokens.space(6), maxWidth: 900, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>Departments</h1>
        <p style={{ color: tokens.color.textMuted }}>
          Group learners into business units to follow their activity separately.
        </p>
        <DepartmentsManager
          organizationId={org.id}
          canManage={org.role === "org_owner" || org.role === "org_admin"}
          initialDepartments={departments ?? []}
        />
      </main>
    </>
  );
}
