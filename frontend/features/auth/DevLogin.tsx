"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { tokens } from "@/lib/tokens";

/**
 * Local sign-in for when Google OIDC has no credentials.
 *
 * Rendered only when NEXT_PUBLIC_ALLOW_DEV_LOGIN is set, and the API's
 * /auth/dev-login route 404s unless ALLOW_DEV_LOGIN is on there too — which
 * loadConfig() refuses to allow in production. Two independent switches, both
 * off by default.
 */
export function DevLogin({ returnTo, primary = false }: { returnTo: string; primary?: boolean }) {
  const [email, setEmail] = useState("learner@example.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/dev-login", {
        method: "POST",
        body: JSON.stringify({ email, name: email.split("@")[0] }),
      });
      // Full reload so the server components pick up the new session cookie.
      window.location.href = returnTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <div style={primary ? undefined : { marginTop: tokens.space(6), paddingTop: tokens.space(5), borderTop: `1px solid ${tokens.color.border}` }}>
      <div style={{ fontSize: tokens.size.xs, color: tokens.color.warning, textTransform: "uppercase", letterSpacing: 1, marginBottom: tokens.space(3) }}>
        Local development only
      </div>
      {error && (
        <div role="alert" style={{ marginBottom: tokens.space(3), color: tokens.color.danger, fontSize: tokens.size.sm }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: tokens.space(2) }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          aria-label="Development sign-in email"
          onKeyDown={(e) => e.key === "Enter" && signIn()}
          style={{
            flex: 1,
            padding: tokens.space(2),
            background: tokens.color.bg,
            color: tokens.color.text,
            border: `1px solid ${tokens.color.borderStrong}`,
            borderRadius: tokens.radius.md,
            fontSize: tokens.size.base,
          }}
        />
        <button
          onClick={signIn}
          disabled={busy || !email.includes("@")}
          style={{
            padding: `${tokens.space(2)} ${tokens.space(4)}`,
            background: "transparent",
            color: tokens.color.text,
            border: `1px solid ${tokens.color.borderStrong}`,
            borderRadius: tokens.radius.md,
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: tokens.size.base,
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
      <p style={{ fontSize: tokens.size.xs, color: tokens.color.textFaint, marginTop: tokens.space(2) }}>
        Any address works — the account is created on first use.
      </p>
    </div>
  );
}
