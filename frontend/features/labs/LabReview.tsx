"use client";

import { useEffect, useState } from "react";
import type { LabStep } from "@curated-labs/shared";
import { api } from "@/lib/api";
import { Badge, Card, Spinner } from "@/components/ui";
import { priorityColor, tokens } from "@/lib/tokens";

type Submission = {
  id: string;
  step: LabStep;
  attemptNumber: number;
  answerJson: unknown;
  aiFeedbackJson: unknown;
  deterministicResultJson: unknown;
};

const STEP_TITLE: Partial<Record<LabStep, string>> = {
  architecture_issues: "1 · Architectural analysis",
  attack_surfaces: "2 · Attack surfaces",
  threats: "3 · Threat identification",
  prioritization: "4 · Assessing priority",
  mitigations: "5 · Mitigation mapping",
  release_decision: "6 · Decision",
};

/**
 * End-of-lab recap. The learning happens in the comparison, so this pulls the
 * whole attempt back together: what they answered, what the coach said, and how
 * their priorities lined up against the curated expectations.
 */
export function LabReview({ attemptId, attemptBase = "/attempts" }: { attemptId: string; attemptBase?: string }) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [threats, setThreats] = useState<{ id: string; title: string; expectedPriority: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ submissions: Submission[]; revealedThreats: typeof threats | null }>(`${attemptBase}/${attemptId}`)
      .then((a) => {
        if (cancelled) return;
        setSubmissions(a.submissions);
        setThreats(a.revealedThreats ?? []);
      })
      .catch(() => !cancelled && setError("Could not load your answers."));
    return () => {
      cancelled = true;
    };
  }, [attemptId, attemptBase]);

  if (error) return <Card>{error}</Card>;
  if (!submissions) return <Card><Spinner label="Loading your answers…" /></Card>;

  // Only the final attempt at each step — the retries are already reflected in it.
  const latest = new Map<LabStep, Submission>();
  for (const s of submissions) latest.set(s.step, s);

  return (
    <div style={{ display: "grid", gap: tokens.space(3) }}>
      {[...latest.values()].map((s) => (
        <Card key={s.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tokens.space(3) }}>
            <strong style={{ fontSize: tokens.size.base }}>{STEP_TITLE[s.step] ?? s.step}</strong>
            {s.attemptNumber > 1 && <Badge>{s.attemptNumber} attempts</Badge>}
          </div>
          <Answer step={s.step} answer={s.answerJson} threats={threats} />
          <Deterministic step={s.step} result={s.deterministicResultJson} threats={threats} />
        </Card>
      ))}
    </div>
  );
}

function Answer({
  step,
  answer,
  threats,
}: {
  step: LabStep;
  answer: unknown;
  threats: { id: string; title: string }[];
}) {
  const a = answer as Record<string, unknown>;
  const muted = { color: tokens.color.textMuted, fontSize: tokens.size.sm, lineHeight: 1.55, margin: 0 };

  if (step === "architecture_issues") return <p style={muted}>{String(a.text ?? "")}</p>;

  if (step === "attack_surfaces") {
    const picked = (Array.isArray(a.referencedNodeIds) ? a.referencedNodeIds.length : 0) +
      (Array.isArray(a.referencedEdgeIds) ? a.referencedEdgeIds.length : 0);
    return (
      <>
        <p style={muted}>{String(a.text ?? "")}</p>
        <p style={muted}>{picked} element{picked === 1 ? "" : "s"} marked on the diagram.</p>
      </>
    );
  }

  if (step === "threats") {
    const list = Array.isArray(a.threats) ? (a.threats as string[]) : [];
    return (
      <ul style={{ ...muted, paddingLeft: tokens.space(5), display: "grid", gap: tokens.space(1) }}>
        {list.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    );
  }

  if (step === "release_decision") {
    return (
      <p style={muted}>
        <strong style={{ color: tokens.color.text, textTransform: "capitalize" }}>
          {String(a.decision ?? "").replace(/_/g, " ")}
        </strong>
        {" — "}
        {String(a.rationale ?? "")}
      </p>
    );
  }

  if (step === "prioritization") {
    const items = Array.isArray(a.items) ? (a.items as { threatId: string; priority: string }[]) : [];
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: tokens.space(1) }}>
        {items.map((i) => (
          <li key={i.threatId} style={{ fontSize: tokens.size.sm, display: "flex", gap: tokens.space(2) }}>
            <span style={{ color: priorityColor[i.priority] ?? tokens.color.textMuted, textTransform: "capitalize", minWidth: 60 }}>
              {i.priority}
            </span>
            <span style={{ color: tokens.color.textMuted }}>
              {threats.find((t) => t.id === i.threatId)?.title ?? i.threatId}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

function Deterministic({
  step,
  result,
  threats,
}: {
  step: LabStep;
  result: unknown;
  threats: { id: string; title: string; expectedPriority: string }[];
}) {
  const r = result as Record<string, unknown> | null;
  if (!r) return null;

  if (step === "attack_surfaces" && typeof r.total === "number") {
    return (
      <p style={{ marginTop: tokens.space(3), fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
        Identified <strong style={{ color: tokens.color.text }}>{String(r.identified)}</strong> of{" "}
        {String(r.total)} ways into the system.
      </p>
    );
  }

  if (step === "mitigations") {
    return (
      <p style={{ marginTop: tokens.space(3), fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
        Matched <strong style={{ color: tokens.color.text }}>{String(r.correctCount)}</strong> of{" "}
        {String(r.totalCount)} threats to their primary mitigation.
      </p>
    );
  }

  if (step === "prioritization" && Array.isArray(r.comparison)) {
    const rows = r.comparison as { threatId: string; learnerPriority: string; expectedPriority: string; matches: boolean }[];
    return (
      <div style={{ marginTop: tokens.space(3), fontSize: tokens.size.sm }}>
        <div style={{ color: tokens.color.textMuted, marginBottom: tokens.space(1) }}>Against the curated expectation</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: tokens.space(1) }}>
          {rows.map((row) => (
            <li key={row.threatId} style={{ display: "flex", gap: tokens.space(2), alignItems: "baseline" }}>
              <span style={{ color: row.matches ? tokens.color.success : tokens.color.warning }}>
                {row.matches ? "=" : "≠"}
              </span>
              <span style={{ color: tokens.color.textMuted, flex: 1 }}>
                {threats.find((t) => t.id === row.threatId)?.title ?? row.threatId}
              </span>
              <span style={{ color: priorityColor[row.learnerPriority] }}>{row.learnerPriority}</span>
              {!row.matches && (
                <span style={{ color: tokens.color.textFaint }}>vs {row.expectedPriority}</span>
              )}
            </li>
          ))}
        </ul>
        <p style={{ color: tokens.color.textFaint, fontSize: tokens.size.xs, marginTop: tokens.space(2) }}>
          A difference is not a mistake — the curated priority is one defensible reading.
        </p>
      </div>
    );
  }
  return null;
}
