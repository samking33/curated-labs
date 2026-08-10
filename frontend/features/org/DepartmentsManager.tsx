"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card, Field, inputStyle } from "@/components/ui";
import { tokens } from "@/lib/tokens";

export type Department = {
  id: string;
  name: string;
  slug: string;
  _count?: { members: number };
};

export function DepartmentsManager({
  organizationId,
  canManage,
  initialDepartments,
}: {
  organizationId: string;
  canManage: boolean;
  initialDepartments: Department[];
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const created = await api<Department>(`/organizations/${organizationId}/departments`, {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      setDepartments((d) => [...d, created]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that department.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const previous = departments;
    setDepartments((d) => d.filter((x) => x.id !== id));
    try {
      await api(`/organizations/${organizationId}/departments/${id}`, { method: "DELETE" });
    } catch (err) {
      setDepartments(previous);
      setError(err instanceof Error ? err.message : "Could not delete that department.");
    }
  };

  return (
    <div style={{ display: "grid", gap: tokens.space(4) }}>
      {error && <Alert tone="error">{error}</Alert>}

      {canManage && (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: tokens.space(2), alignItems: "end" }}>
            <Field label="New department">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Platform Engineering" />
            </Field>
            <div style={{ marginBottom: tokens.space(4) }}>
              <Button onClick={create} disabled={busy || name.trim().length < 2}>
                {busy ? "Creating…" : "Add"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {departments.length === 0 ? (
          <p style={{ color: tokens.color.textMuted, margin: 0 }}>No departments yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: tokens.space(2) }}>
            {departments.map((d) => (
              <li key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div>{d.name}</div>
                  <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
                    {d._count?.members ?? 0} member{(d._count?.members ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                {canManage && <Button variant="danger" onClick={() => remove(d.id)}>Delete</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
