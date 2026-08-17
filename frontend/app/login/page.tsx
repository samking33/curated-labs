import { tokens } from "@/lib/tokens";
import { SecuracyLockup } from "@/features/brand/SecuracyLogo";
import { DevLogin } from "@/features/auth/DevLogin";

export const metadata = { title: "Sign in · Securacy" };

/** Google only. There is deliberately no password field anywhere. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  // Relative: proxied to the API, and stable across server/client render.
  const href = `/api/v1/auth/google?returnTo=${encodeURIComponent(returnTo ?? "/app")}`;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: tokens.color.bg, color: tokens.color.text, padding: tokens.space(6) }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: tokens.space(4) }}>
          <SecuracyLockup height={46} />
        </div>
        <p style={{ color: tokens.color.textMuted, marginBottom: tokens.space(6) }}>
          Practise threat modeling on realistic systems, with an AI coach.
        </p>

        {error && (
          <div role="alert" style={{ marginBottom: tokens.space(4), padding: tokens.space(3), border: `1px solid ${tokens.color.danger}`, borderRadius: tokens.radius.md, color: tokens.color.danger, fontSize: tokens.size.sm }}>
            Sign-in failed: {error}
          </div>
        )}

        {process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true" ? (
          // Google OIDC has no credentials configured yet - dev login is the
          // only working sign-in path for now, so it's the primary action.
          <DevLogin returnTo={returnTo ?? "/app"} primary />
        ) : (
          <a
            href={href}
            style={{
              display: "block",
              padding: tokens.space(3),
              background: tokens.color.accent,
              color: tokens.color.accentText,
              borderRadius: tokens.radius.md,
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Continue with Google
          </a>
        )}
        <p style={{ marginTop: tokens.space(5), fontSize: tokens.size.xs, color: tokens.color.textFaint }}>
          No grades, no certificates. Just practice.
        </p>
      </div>
    </main>
  );
}
