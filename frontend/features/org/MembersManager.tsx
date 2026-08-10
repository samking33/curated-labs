"use client";

import { useState } from "react";
import type { OrgRole } from "@curated-labs/shared";
import { api } from "@/lib/api";
import { Alert, Badge, Button, Card, Field, inputStyle } from "@/components/ui";
import { tokens } from "@/lib/tokens";

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  departments: { id: string; name: string; isManager: boolean }[];
};

const ROLES: OrgRole[] = ["org_owner", "org_admin", "department_manager", "learner"];

/**
 * Member list plus invitations. Mirrors the server's rules in the UI, but the
 * API re-checks every one of them — this is affordance, not enforcement.
 */
export function MembersManager({
  organizationId,
  myRole,
  myUserId,
  initialMembers,
}: {
  organizationId: string;
  myRole: OrgRole;
  myUserId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("learner");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = myRole === "org_owner" || myRole === "org_admin";

  const invite = async () => {
    setBusy(true);
    setError(null);
    setInviteToken(null);
    try {
      const res = await api<{ token: string }>(`/organizations/${organizationId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      // Shown once. The API stores only a hash, so it cannot be recovered.
      setInviteToken(res.token);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invitation.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, next: OrgRole) => {
    setError(null);
    const previous = members;
    setMembers((m) => m.map((x) => (x.userId === userId ? { ...x, role: next } : x)));
    try {
      await api(`/organizations/${organizationId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      });
    } catch (err) {
      setMembers(previous); // roll back the optimistic update
      setError(err instanceof Error ? err.message : "Could not change that role.");
    }
  };

  const remove = async (userId: string) => {
    setError(null);
    const previous = members;
    setMembers((m) => m.filter((x) => x.userId !== userId));
    try {
      await api(`/organizations/${organizationId}/members/${userId}`, { method: "DELETE" });
    } catch (err) {
      setMembers(previous);
      setError(err instanceof Error ? err.message : "Could not remove that member.");
    }
  };

  return (
    <div style={{ display: "grid", gap: tokens.space(4) }}>
      {error && <Alert tone="error">{error}</Alert>}

      {canManage && (
        <Card>
          <strong>Invite someone</strong>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: tokens.space(2), alignItems: "end", marginTop: tokens.space(3) }}>
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={inputStyle} />
            </Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} style={inputStyle}>
                {ROLES.filter((r) => myRole === "org_owner" || r !== "org_owner").map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <div style={{ marginBottom: tokens.space(4) }}>
              <Button onClick={invite} disabled={busy || !email.includes("@")}>
                {busy ? "Sending…" : "Invite"}
              </Button>
            </div>
          </div>

          {inviteToken && (
            <Alert tone="info">
              Share this invitation token — it is shown once and cannot be retrieved again:
              <code style={{ display: "block", marginTop: tokens.space(2), padding: tokens.space(2), background: tokens.color.bg, borderRadius: tokens.radius.sm, fontSize: tokens.size.sm, wordBreak: "break-all" }}>
                {inviteToken}
              </code>
            </Alert>
          )}
        </Card>
      )}

      <Card>
        {members.length === 0 ? (
          <p style={{ color: tokens.color.textMuted, margin: 0 }}>No members yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: tokens.space(3) }}>
            {members.map((m) => (
              <li key={m.userId} style={{ display: "flex", alignItems: "center", gap: tokens.space(3), flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div>{m.name}{m.userId === myUserId && <span style={{ color: tokens.color.textFaint }}> (you)</span>}</div>
                  <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>{m.email}</div>
                  {m.departments.length > 0 && (
                    <div style={{ display: "flex", gap: tokens.space(1), marginTop: tokens.space(1) }}>
                      {m.departments.map((d) => (
                        <Badge key={d.id}>{d.name}{d.isManager ? " · manager" : ""}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                {canManage && m.userId !== myUserId ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value as OrgRole)}
                      aria-label={`Role for ${m.name}`}
                      style={{ ...inputStyle, width: "auto" }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </select>
                    <Button variant="danger" onClick={() => remove(m.userId)}>Remove</Button>
                  </>
                ) : (
                  <Badge>{m.role.replace(/_/g, " ")}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
