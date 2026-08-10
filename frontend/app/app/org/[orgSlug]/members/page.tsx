import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { tokens } from "@/lib/tokens";
import { AppNav } from "@/features/auth/AppNav";
import { MembersManager, type Member } from "@/features/org/MembersManager";

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect(`/login?returnTo=/app/org/${orgSlug}/members`);

  const org = me.organizations.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const members = await serverApi<Member[]>(`/organizations/${org.id}/members`, cookie);

  return (
    <>
      <AppNav me={me} />
      <main style={{ padding: tokens.space(6), maxWidth: 900, margin: "0 auto", color: tokens.color.text }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginTop: 0 }}>Members</h1>
        <MembersManager
          organizationId={org.id}
          myRole={org.role}
          myUserId={me.user.id}
          initialMembers={members ?? []}
        />
      </main>
    </>
  );
}
