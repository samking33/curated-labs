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
 * API re-checks every one of them: this is affordance, not enforcement.
 */
export function MembersManager({
  organizationId,
  myRole,
  myUserId,
  initialMembers,
  departments,
}: {
  organizationId: string;
  myRole: OrgRole;
  myUserId: string;
  initialMembers: Member[];
  departments: { id: string; name: string }[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("learner");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = myRole === "org_owner" || myRole === "org_admin";
  const unassigned = (m: Member) => departments.filter((d) => !m.departments.some((x) => x.id === d.id));

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

  const addToDepartment = async (member: Member, departmentId: string) => {
    setError(null);
    const department = departments.find((d) => d.id === departmentId);
    if (!department) return;
    // A department manager manages the departments they are placed in.
    const isManager = member.role === "department_manager";
    const previous = members;
    setMembers((m) =>
      m.map((x) =>
        x.userId === member.userId
          ? { ...x, departments: [...x.departments, { id: department.id, name: department.name, isManager }] }
          : x,
      ),
    );
    try {
      await api(`/organizations/${organizationId}/departments/${departmentId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: member.userId, isManager }),
      });
    } catch (err) {
      setMembers(previous);
      setError(err instanceof Error ? err.message : "Could not add them to that department.");
    }
  };

  const removeFromDepartment = async (userId: string, departmentId: string) => {
    setError(null);
    const previous = members;
    setMembers((m) =>
      m.map((x) => (x.userId === userId ? { ...x, departments: x.departments.filter((d) => d.id !== departmentId) } : x)),
    );
    try {
      await api(`/organizations/${organizationId}/departments/${departmentId}/members/${userId}`, { method: "DELETE" });
    } catch (err) {
      setMembers(previous);
      setError(err instanceof Error ? err.message : "Could not remove them from that department.");
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
              Share this invitation token. It is shown once and cannot be retrieved again:
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
                  <div style={{ display: "flex", gap: tokens.space(1), marginTop: tokens.space(1), flexWrap: "wrap", alignItems: "center" }}>
                    {m.departments.map((d) => (
                      <Badge key={d.id}>
                        {d.name}{d.isManager ? " · manager" : ""}
                        {canManage && (
                          <button
                            onClick={() => removeFromDepartment(m.userId, d.id)}
                            aria-label={`Remove ${m.name} from ${d.name}`}
                            style={{
                              marginLeft: tokens.space(1),
                              border: "none",
                              background: "none",
                              color: "inherit",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: "inherit",
                            }}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                    {canManage && unassigned(m).length > 0 && (
                      <select
                        value=""
                        onChange={(e) => addToDepartment(m, e.target.value)}
                        aria-label={`Add ${m.name} to a department`}
                        style={{ ...inputStyle, width: "auto", fontSize: tokens.size.sm, padding: `${tokens.space(1)} ${tokens.space(2)}` }}
                      >
                        <option value="">Add to department…</option>
                        {unassigned(m).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
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
