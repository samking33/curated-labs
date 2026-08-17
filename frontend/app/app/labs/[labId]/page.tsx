import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { LabDetail } from "@curated-labs/shared";
import { getMe } from "@/lib/session";
import { serverApi } from "@/lib/server-api";
import { LabShell } from "@/features/labs/LabShell";

export default async function LabPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params;
  const cookie = (await headers()).get("cookie") ?? undefined;

  const me = await getMe(cookie);
  if (!me) redirect(`/login?returnTo=/app/labs/${labId}`);

  // This payload carries no canonical threats or answer keys: the API's
  // selection cannot produce them.
  const lab = await serverApi<LabDetail>(`/labs/${labId}`, cookie);
  if (!lab) notFound();

  return <LabShell lab={lab} attemptId={lab.attempt?.id} />;
}
