"use client";

import type { StepResult } from "@curated-labs/shared";
import { Alert, Badge, Card } from "@/components/ui";
import { tokens } from "@/lib/tokens";

/**
 * Renders AI coaching plus any deterministic result.
 *
 * Handles all four states: loading, success, retry-able failure,
 * and AI unavailable. The last one is important: the answer is already saved,
 * so this must read as "coaching is missing", never "your work was lost".
 */
export function FeedbackPanel({
  result,
  loading,
  error,
  onRetry,
}: {
  result: StepResult | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <span style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
          Reviewing your answer…
        </span>
      </Card>
    );
  }
  if (error) {
    return (
      <Alert tone="error">
        {error}
        {onRetry && (
          <button
            onClick={onRetry}
            style={{ marginLeft: 8, color: "inherit", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}
          >
            Try again
          </button>
        )}
      </Alert>
    );
  }
  if (!result) return null;

  const fb = result.aiFeedback as Record<string, unknown> | null;

  return (
    <div style={{ display: "grid", gap: tokens.space(3) }}>
      {result.aiStatus !== "ok" && (
        <Alert tone="warning">
          Your answer is saved, but the AI coach is unavailable right now.
          {onRetry && (
            <button
              onClick={onRetry}
              style={{ marginLeft: 8, color: "inherit", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}
            >
              Request feedback again
            </button>
          )}
        </Alert>
      )}

      {fb && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tokens.space(3) }}>
            <strong style={{ fontSize: tokens.size.lg }}>Coach feedback</strong>
            <Badge>Coaching, not a grade</Badge>
          </div>

          {typeof fb.headline === "string" && (
            <p style={{ margin: `0 0 ${tokens.space(3)}`, fontSize: tokens.size.base, fontWeight: 600, lineHeight: 1.5 }}>
              {fb.headline}
            </p>
          )}
          <Prose text={pick(fb, "summary", "feedback", "decisionReflection", "overallFeedback")} />

          <List title="What you covered well" items={arr(fb.strengths ?? fb.reasoningStrengths)} />
          <List title="Worth exploring" items={arr(fb.coachingTips ?? fb.reasoningGaps)} />
          <List title="Reasonable extra observations" items={arr(fb.reasonableExtraObservations ?? fb.extraObservations)} />
          <List title="Conditions to consider" items={arr(fb.suggestedConditions)} />

          {typeof fb.confidence === "number" && (
            <p style={{ marginTop: tokens.space(3), fontSize: tokens.size.xs, color: tokens.color.textFaint }}>
              Coach confidence: {Math.round(fb.confidence * 100)}%. Treat low confidence as a prompt to
              discuss, not a verdict.
            </p>
          )}
        </Card>
      )}

      {Array.isArray((result.deterministicResult as { hints?: unknown })?.hints) &&
        ((result.deterministicResult as { hints: { issueId: string; hint: string }[] }).hints.length > 0) && (
          <Card style={{ borderColor: tokens.color.accent }}>
            <strong style={{ fontSize: tokens.size.base }}>Nudges toward what you missed</strong>
            <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 ${tokens.space(3)}` }}>
              Questions, not answers. Look at the diagram again with these in mind.
            </p>
            <ul style={{ margin: 0, paddingLeft: tokens.space(5), display: "grid", gap: tokens.space(2) }}>
              {(result.deterministicResult as { hints: { issueId: string; hint: string }[] }).hints.map((h) => (
                <li key={h.issueId} style={{ fontSize: tokens.size.base, lineHeight: 1.55 }}>{h.hint}</li>
              ))}
            </ul>
          </Card>
        )}

      {result.revealedAttackSurfaces && result.revealedAttackSurfaces.length > 0 && (
        <Card style={{ borderColor: tokens.color.accent }}>
          <strong style={{ fontSize: tokens.size.lg }}>Every way into this system</strong>
          <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(2)} 0` }}>
            Ticked ones you found. An attack surface is a way in, not a weakness. Naming what could
            go wrong there is the next step.
          </p>
          <ul style={{ display: "grid", gap: tokens.space(2), listStyle: "none", padding: 0, margin: 0 }}>
            {result.revealedAttackSurfaces.map((s) => {
              const found = identifiedIds(result).includes(s.id);
              return (
                <li
                  key={s.id}
                  style={{
                    borderLeft: `2px solid ${found ? tokens.color.accent : tokens.color.border}`,
                    paddingLeft: tokens.space(3),
                  }}
                >
                  <div style={{ display: "flex", gap: tokens.space(2), alignItems: "center" }}>
                    <span aria-hidden style={{ color: found ? tokens.color.accent : tokens.color.textFaint }}>
                      {found ? "\u2713" : "\u25cb"}
                    </span>
                    <strong>{s.label}</strong>
                    <Badge>{s.kind === "edge" ? "Data flow" : "Entity"}</Badge>
                  </div>
                  <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 0` }}>
                    {s.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {result.revealedThreats && result.revealedThreats.length > 0 && (
        <Card style={{ borderColor: tokens.color.warning }}>
          <strong style={{ fontSize: tokens.size.lg }}>The full threat set for this lab</strong>
          <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(2)} 0` }}>
            Shown now that you have worked through the retries. Compare against what you found.
          </p>
          <ul style={{ display: "grid", gap: tokens.space(3), listStyle: "none", padding: 0, margin: 0 }}>
            {result.revealedThreats.map((t) => (
              <li key={t.id} style={{ borderLeft: `2px solid ${tokens.color.border}`, paddingLeft: tokens.space(3) }}>
                <div style={{ display: "flex", gap: tokens.space(2), alignItems: "center" }}>
                  <strong>{t.title}</strong>
                  <Badge>{t.category}</Badge>
                </div>
                <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 0` }}>
                  {t.description}
                </p>
                {t.learnerExplanation && (
                  <p style={{ color: tokens.color.textFaint, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 0`, fontStyle: "italic" }}>
                    {t.learnerExplanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Which surfaces the learner got, from the deterministic result the server
 *  computed: never inferred from the model's prose. */
function identifiedIds(result: StepResult): string[] {
  const d = result.deterministicResult as { identifiedIds?: unknown } | null;
  return Array.isArray(d?.identifiedIds) ? (d.identifiedIds as string[]) : [];
}

function Prose({ text }: { text: string | null }) {
  if (!text) return null;
  return <p style={{ margin: 0, lineHeight: 1.6, fontSize: tokens.size.base }}>{text}</p>;
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: tokens.space(4) }}>
      <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted, marginBottom: tokens.space(1) }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: tokens.space(5), display: "grid", gap: tokens.space(1) }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: tokens.size.base, lineHeight: 1.55 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Model output is loosely typed by design; read defensively. */
function pick(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
  return null;
}
function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
