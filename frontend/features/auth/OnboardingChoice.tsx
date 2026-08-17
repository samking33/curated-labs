"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card, Field, inputStyle } from "@/components/ui";
import { tokens } from "@/lib/tokens";

type Mode = "choose" | "organization" | "invite";

/** step 2. Three paths: solo, create an org, or redeem an invitation. */
export function OnboardingChoice() {
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: tokens.color.bg, color: tokens.color.text, padding: tokens.space(6) }}>
      <div style={{ maxWidth: 460, width: "100%" }}>
        <h1 style={{ fontSize: tokens.size.xxl, marginBottom: tokens.space(2) }}>How will you use Securacy?</h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: tokens.space(5) }}>
          You can join an organization later.
        </p>

        {error && <div style={{ marginBottom: tokens.space(4) }}><Alert tone="error">{error}</Alert></div>}

        {mode === "choose" && (
          <div style={{ display: "grid", gap: tokens.space(3) }}>
            <Card>
              <strong>Practise on my own</strong>
              <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 ${tokens.space(3)}` }}>
                Full catalog access. Your progress stays private to you.
              </p>
              <Button onClick={() => run(() => api("/onboarding/individual", { method: "POST" }))} disabled={busy}>
                Continue solo
              </Button>
            </Card>
            <Card>
              <strong>Set up an organization</strong>
              <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 ${tokens.space(3)}` }}>
                Invite your team, group them into departments, and follow their activity.
              </p>
              <Button variant="ghost" onClick={() => setMode("organization")} disabled={busy}>
                Create an organization
              </Button>
            </Card>
            <Card>
              <strong>I have an invitation</strong>
              <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 ${tokens.space(3)}` }}>
                Paste the invitation token your admin sent you.
              </p>
              <Button variant="ghost" onClick={() => setMode("invite")} disabled={busy}>
                Redeem invitation
              </Button>
            </Card>
          </div>
        )}

        {mode === "organization" && (
          <Card>
            <Field label="Organization name">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // Suggest a slug, but let the user override it.
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60));
                }}
                style={inputStyle}
              />
            </Field>
            <Field label="URL" hint="Lowercase letters, digits and hyphens.">
              <input value={slug} onChange={(e) => setSlug(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: tokens.space(2) }}>
              <Button
                onClick={() => run(() => api("/onboarding/organizations", { method: "POST", body: JSON.stringify({ name, slug }) }))}
                disabled={busy || name.length < 2 || slug.length < 2}
              >
                {busy ? "Creating…" : "Create"}
              </Button>
              <Button variant="ghost" onClick={() => setMode("choose")} disabled={busy}>Back</Button>
            </div>
          </Card>
        )}

        {mode === "invite" && (
          <Card>
            <Field label="Invitation token">
              <input value={token} onChange={(e) => setToken(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: tokens.space(2) }}>
              <Button
                onClick={() => run(() => api("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) }))}
                disabled={busy || token.length < 16}
              >
                {busy ? "Joining…" : "Join"}
              </Button>
              <Button variant="ghost" onClick={() => setMode("choose")} disabled={busy}>Back</Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
