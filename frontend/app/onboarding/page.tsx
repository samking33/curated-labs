import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { OnboardingChoice } from "@/features/auth/OnboardingChoice";

export const metadata = { title: "Get started — Curated Labs" };

/** §2 step 2: individual account, or create/join an organization. */
export default async function OnboardingPage() {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const me = await getMe(cookie);
  if (!me) redirect("/login?returnTo=/onboarding");
  if (me.accountKind) redirect("/app");
  return <OnboardingChoice />;
}
