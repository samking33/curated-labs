"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { tokens } from "@/lib/tokens";
import { Alert } from "@/components/ui";

/**
 * Leaderboard visibility.
 *
 * Opting out hides the learner from everyone else's ranking; it does not stop
 * their points being recorded, and they still see their own standing. Written
 * as an optimistic toggle that rolls back on failure: a preference control
 * that silently does nothing is worse than one that says it failed.
 */
export function PrivacyPreferences({ initialOptOut }: { initialOptOut: boolean }) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = async () => {
    const next = !optOut;
    const previous = optOut;
    setOptOut(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api("/auth/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ leaderboardOptOut: next }),
      });
      setSaved(true);
    } catch {
      setOptOut(previous);
      setError("Could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginBottom: tokens.space(6) }}>
      <h2 style={{ fontSize: tokens.size.lg }}>Privacy</h2>

      <label style={{ display: "flex", gap: tokens.space(3), alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={optOut}
          onChange={toggle}
          disabled={saving}
          style={{ marginTop: 3, width: 18, height: 18, cursor: "pointer" }}
        />
        <span>
          <span style={{ display: "block", fontSize: tokens.size.base }}>
            Hide me from the leaderboard
          </span>
          <span style={{ display: "block", color: tokens.color.textMuted, fontSize: tokens.size.sm, lineHeight: 1.5 }}>
            Your name stops appearing in the public and organization rankings. You keep earning
            points and can still see your own position.
          </span>
        </span>
      </label>

      <div style={{ marginTop: tokens.space(3), minHeight: 20 }}>
        {error && <Alert tone="error">{error}</Alert>}
        {!error && saved && (
          <span style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }} role="status">
            Saved.
          </span>
        )}
      </div>
    </section>
  );
}
