"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { THREAT_RETRY_LIMIT, stepIndex, type DfdSelection, type LabDetail, type LabStep, type StepResult } from "@curated-labs/shared";
import { DfdEditorFrame } from "@/features/dfd-editor/DfdEditorFrame";
import { api, ApiRequestError, newIdempotencyKey } from "@/lib/api";
import { tokens } from "@/lib/tokens";
import { Alert, Button, Card } from "@/components/ui";
import { LabHeader, Roadmap } from "./LabHeader";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import { CheerToast } from "@/features/gamification/CheerToast";
import { FeedbackPanel } from "./FeedbackPanel";
import { LabReview } from "./LabReview";
import {
  ArchitectureIssuesStep,
  AttackSurfacesStep,
  MitigationMatchingStep,
  PrioritizationStep,
  ReleaseDecisionStep,
  ThreatIdentificationStep,
  type RevealedThreat,
} from "./steps";

const STEP_LABELS: { step: LabStep; label: string }[] = [
  { step: "intro", label: "Brief" },
  { step: "architecture_issues", label: "Architectural analysis" },
  { step: "attack_surfaces", label: "Attack surfaces" },
  { step: "threats", label: "Threat identification" },
  { step: "prioritization", label: "Assessing priority" },
  { step: "mitigations", label: "Mitigation mapping" },
  { step: "release_decision", label: "Decision" },
];

const ENDPOINT: Partial<Record<LabStep, string>> = {
  architecture_issues: "architecture-issues",
  attack_surfaces: "attack-surfaces",
  threats: "threats",
  prioritization: "prioritization",
  mitigations: "mitigations",
  release_decision: "release-decision",
};

/**
 * Owns the whole guided workflow (§16): step state, submission, retry, and the
 * DFD/answer split. Step components stay presentational so the visual identity
 * can be replaced without touching workflow logic.
 */
export function LabShell({
  lab,
  attemptId: initialAttemptId,
  /** Where "Start" POSTs. Playground: `/playground/scenarios/${id}/attempts`. */
  startPath = `/labs/${lab.id}/attempts`,
  /** Prefix for restore, submit and review. Playground: "/playground/attempts". */
  attemptBase = "/attempts",
  /** Breadcrumb + completion-card target. Playground: "/app/playground". */
  backHref = "/app/catalog",
  /** Present only for an unaccepted Playground scenario review. When set,
   *  the DFD panel is editable (until an attempt exists) and PATCHes here
   *  on save. Omitted for curated labs and already-started attempts, where
   *  the panel is always view-only. */
  dfdSavePath,
}: {
  lab: LabDetail;
  attemptId?: string;
  startPath?: string;
  attemptBase?: string;
  backHref?: string;
  dfdSavePath?: string;
}) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | undefined>(initialAttemptId);
  const [step, setStep] = useState<LabStep>("intro");
  const [selection, setSelection] = useState<DfdSelection>(null);
  const [result, setResult] = useState<StepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only set when a submission actually earned a "correct answer" cheer —
  // the flat participation awards on steps 1 and 5 never populate this.
  const [cheer, setCheer] = useState<{ key: string; points: number; cheers: string[] } | null>(null);

  /**
   * Set after a submission that advances the lab, holding the step to move to
   * once the learner has actually read the coaching for the step they just
   * finished.
   *
   * Without this the workflow advanced the instant a step was submitted, so
   * the next step's form rendered directly above its own feedback — the
   * revealed threat list appeared *below* the prioritization table, and the
   * priority and mitigation coaching was skipped past entirely. Both were
   * reported from real use: "it goes to prioritization and then I need to
   * scroll down to look at the detailed threat list", and "it did not show me
   * priority reasoning, it directly jumped to the next step".
   */
  const [pendingStep, setPendingStep] = useState<LabStep | null>(null);

  /**
   * Read-only look-back. Holds the finished step being reviewed, if any.
   * Submitted answers cannot be changed — the server has already graded them
   * and awarded points — so this shows what was said and what the coach
   * replied, and nothing more.
   */
  const [reviewing, setReviewing] = useState<LabStep | null>(null);
  const [history, setHistory] = useState<Record<string, { answer: unknown; aiFeedback: unknown; deterministic: unknown }>>({});

  /**
   * The threat list used by steps 3 and 4. It only ever comes from a reveal
   * response — the lab payload never carries canonical threats (§28), so before
   * reveal there is genuinely nothing here to leak.
   */
  const [threats, setThreats] = useState<RevealedThreat[]>([]);

  /**
   * Threats-step state. Tracked separately because StepResult describes the
   * step the learner is now ON, not the one they just submitted — after step 1
   * the result already reads "threats", which would fake a retry.
   */
  const [lastThreatAnswer, setLastThreatAnswer] = useState<string[]>([]);
  const [threatAttempts, setThreatAttempts] = useState(0);

  /**
   * Restore an in-flight attempt on mount. Without this a refresh drops the
   * revealed threat list and steps 3–4 render with nothing to work on, so the
   * lab cannot be finished — and §16 promises learners can leave and return.
   */
  useEffect(() => {
    if (!initialAttemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const attempt = await api<{
          currentStep: LabStep;
          status: string;
          revealedThreats: RevealedThreat[] | null;
          submissions: { step: LabStep; answer: unknown; aiFeedbackJson: unknown; deterministicResultJson: unknown; attemptNumber: number; id: string }[];
        }>(`${attemptBase}/${initialAttemptId}`);
        if (cancelled) return;

        // Never move the learner BACKWARDS. Starting a lab calls
        // router.refresh(), which makes the server hand this component an
        // attemptId for the first time and re-runs this effect — with the
        // attempt still recorded as "intro", since the first step has not
        // been submitted yet. Assigning that straight back put the learner
        // on the brief again, one click after pressing Start. Taking the
        // later of the two keeps a genuine reload restoring progress while
        // ignoring a stale "intro" arriving after we have already advanced.
        setStep((prev) => (stepIndex(attempt.currentStep) > stepIndex(prev) ? attempt.currentStep : prev));
        if (attempt.revealedThreats) setThreats(attempt.revealedThreats);

        // Put the most recent coaching back on screen so returning mid-lab does
        // not look like the previous answer vanished.
        setThreatAttempts(attempt.submissions.filter((sub) => sub.step === "threats").length);
        setHistory(
          Object.fromEntries(
            attempt.submissions.map((sub) => [
              sub.step,
              { answer: sub.answer, aiFeedback: sub.aiFeedbackJson, deterministic: sub.deterministicResultJson },
            ]),
          ),
        );

        const last = attempt.submissions.at(-1);
        if (last) {
          setResult({
            submissionId: last.id,
            attemptNumber: last.attemptNumber,
            currentStep: attempt.currentStep,
            aiFeedback: last.aiFeedbackJson ?? null,
            aiStatus: last.aiFeedbackJson ? "ok" : "unavailable",
            deterministicResult: last.deterministicResultJson ?? null,
            revealedAttackSurfaces: null,
            revealedThreats: null,
            // Reconstructing history on page load, not a live award — no
            // toast for points already earned in a past visit.
            pointsAwarded: 0,
            cheers: [],
          });
        }
      } catch {
        // A stale attempt id just means the learner starts fresh below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialAttemptId, attemptBase]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const attempt = await api<{ id: string; currentStep: LabStep }>(startPath, { method: "POST" });
      setAttemptId(attempt.id);
      // Resume where the learner left off rather than restarting the lab.
      setStep(attempt.currentStep === "intro" ? "architecture_issues" : attempt.currentStep);
      // The DFD panel stays editable across every step (see the `mode` prop
      // below) — this just keeps the `lab` prop in sync with any edit made
      // before starting, so a subsequent iframe reload (graph reference
      // change) never shows stale content next to a save that already made
      // it to the database.
      router.refresh();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }, [startPath, router]);

  const submit = useCallback(
    async (target: LabStep, body: unknown) => {
      if (!attemptId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api<StepResult>(`${attemptBase}/${attemptId}/steps/${ENDPOINT[target]}`, {
          method: "POST",
          body: JSON.stringify(body),
          // A retry after a timeout must not double-submit or re-bill the AI.
          idempotencyKey: newIdempotencyKey(),
        });
        setResult(res);
        setHistory((prev) => ({
          ...prev,
          [target]: { answer: body, aiFeedback: res.aiFeedback, deterministic: res.deterministicResult },
        }));
        if (res.revealedThreats?.length) setThreats(res.revealedThreats);
        if (res.cheers.length > 0) {
          setCheer({ key: res.submissionId, points: res.pointsAwarded, cheers: res.cheers });
        }
        // Staying on the same step means a retry (threats, before reveal) —
        // the learner needs the form back immediately. Reaching "completed"
        // ends the lab, and its own summary already shows everything. Any
        // other advance pauses on the coaching first.
        if (res.currentStep === target || res.currentStep === "completed") setStep(res.currentStep);
        else setPendingStep(res.currentStep);
      } catch (err) {
        setError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [attemptId, attemptBase],
  );

  const currentIndex = STEP_LABELS.findIndex((s) => s.step === step);

  const body = useMemo(() => {
    if (!attemptId || step === "intro") {
      return (
        <Card>
          <p
            style={{
              margin: 0,
              fontSize: tokens.size.xs,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: tokens.color.accentInk,
              fontWeight: 600,
            }}
          >
            The brief
          </p>
          <h2
            style={{
              margin: `${tokens.space(2)} 0 ${tokens.space(4)}`,
              fontSize: "24px",
              letterSpacing: "-0.02em",
              fontWeight: 600,
            }}
          >
            {lab.summary}
          </h2>

          <Section title="Business context">{lab.businessContext}</Section>
          <Section title="System context">{lab.systemContext}</Section>

          {/* Reassurance sits next to the button because "am I being marked?"
              is the question that stops people starting. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.space(3),
              padding: tokens.space(4),
              marginBottom: tokens.space(4),
              borderRadius: tokens.radius.lg,
              background: tokens.color.accentSoft,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="9.2" stroke={tokens.color.accent} strokeWidth="1.7" />
              <path d="M12 7.6v5.2M12 16.2h.01" stroke={tokens.color.accent} strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: tokens.size.sm, lineHeight: 1.5, color: tokens.color.text }}>
              Nothing here is graded. You can leave and come back — your answers save as you go.
            </span>
          </div>

          <Button onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start lab →"}
          </Button>
        </Card>
      );
    }

    switch (step) {
      case "architecture_issues":
        return <ArchitectureIssuesStep selection={selection} busy={busy} onSubmit={(a) => submit("architecture_issues", a)} />;
      case "attack_surfaces":
        return <AttackSurfacesStep selection={selection} busy={busy} onSubmit={(a) => submit("attack_surfaces", a)} />;
      case "threats": {
        const used = threatAttempts;
        return (
          <ThreatIdentificationStep
            // Remount on each attempt so the form re-seeds from the last answer.
            key={`threats-${used}`}
            selection={selection}
            busy={busy}
            attemptNumber={used + 1}
            retriesLeft={Math.max(0, THREAT_RETRY_LIMIT - 1 - used)}
            previousAnswer={lastThreatAnswer}
            onSubmit={(a) => {
              setLastThreatAnswer(a.threats);
              setThreatAttempts((n) => n + 1);
              submit("threats", a);
            }}
          />
        );
      }
      case "prioritization":
        return <PrioritizationStep threats={threats} busy={busy} onSubmit={(a) => submit("prioritization", a)} />;
      case "mitigations":
        return (
          <MitigationMatchingStep
            threats={threats}
            mitigations={lab.mitigationOptions}
            busy={busy}
            onSubmit={(a) => submit("mitigations", a)}
          />
        );
      case "release_decision":
        return <ReleaseDecisionStep busy={busy} onSubmit={(a) => submit("release_decision", a)} />;
      case "completed":
        return (
          <>
            <Card>
              <h2 style={{ marginTop: 0, fontSize: tokens.size.xl }}>Lab complete</h2>
              <p style={{ color: tokens.color.textMuted }}>
                You worked through the full threat model. Below is everything you said, and how it
                compared. Nothing here is a score.
              </p>
              <a href={backHref} style={{ color: tokens.color.accent }}>
                Back to catalog
              </a>
            </Card>
            {attemptId && <LabReview attemptId={attemptId} attemptBase={attemptBase} />}
          </>
        );
      default:
        return null;
    }
  }, [attemptId, step, lab, selection, busy, threats, result, lastThreatAnswer, threatAttempts, start, submit, backHref, attemptBase]);

  return (
    <div style={{ minHeight: "100vh", background: tokens.color.bg, color: tokens.color.text }}>
      {cheer && (
        <CheerToast key={cheer.key} points={cheer.points} cheers={cheer.cheers} onDone={() => setCheer(null)} />
      )}
      <LabHeader
        title={lab.title}
        categoryName={lab.category.name}
        categorySlug={lab.category.slug}
        difficulty={lab.difficulty}
        minutes={lab.estimatedMinutes}
        steps={STEP_LABELS}
        currentIndex={currentIndex}
        onRevisit={attemptId ? (s) => setReviewing(s) : undefined}
        backHref={backHref}
      />

      {/*
       * Diagram left, work right. The diagram is the subject of every step, so
       * it keeps the larger column and stays pinned while the right column
       * scrolls — previously both scrolled together and the learner lost sight
       * of the thing they were being asked about.
       */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(380px, 1fr)",
          gap: tokens.space(5),
          alignItems: "start",
          padding: tokens.space(7),
        }}
      >
        <div style={{ position: "sticky", top: 150, display: "grid", gap: tokens.space(2) }}>
        <section
          style={{
            // Tuned to the diagrams rather than the viewport: the flat layouts
            // are wide and short, so fitting is width-bound and extra height
            // just adds empty canvas above and below the graph.
            height: "min(74vh, 660px)",
            minHeight: 440,
            borderRadius: tokens.radius.xl,
            overflow: "hidden",
            boxShadow: tokens.shadow.card,
            border: `1px solid ${tokens.color.border}`,
          }}
        >
          <DfdEditorFrame
            graph={lab.dfd}
            // Editable for the whole workflow whenever this scenario has a
            // save path (Playground only — curated labs never pass
            // dfdSavePath and stay view-only throughout, as intended).
            mode={dfdSavePath ? "edit" : "view"}
            onSelectionChange={setSelection}
            onSave={
              dfdSavePath
                ? async (xml) => {
                    // DfdEditorFrame doesn't await/catch this (see its own
                    // comment) — an uncaught rejection here is a silent save
                    // failure with zero feedback, which is exactly the
                    // referential-integrity 400 case (delete a node a threat
                    // still points at). Route it through the same error
                    // state and Alert every other step already uses.
                    try {
                      await api(dfdSavePath, { method: "PATCH", body: JSON.stringify({ drawioXml: xml }) });
                      setError(null);
                    } catch (err) {
                      setError(messageFor(err));
                    }
                  }
                : undefined
            }
          />
        </section>

        {/* Same wording for curated and generated DFDs (dfdSavePath only
            distinguishes editability) — neither is a real system, both are
            teaching aids a learner could otherwise mistake for ground truth. */}
        <p style={{ margin: 0, fontSize: tokens.size.xs, color: tokens.color.textFaint, fontStyle: "italic" }}>
          Reference architecture and DFD for learning purposes only. Multiple valid representations may exist.
        </p>
        </div>

        <div style={{ display: "grid", gap: tokens.space(4), alignContent: "start", minWidth: 0 }}>
          {error && <Alert tone="error">{error}</Alert>}
          <NodeDetailsPanel selection={selection} />
          {/* Looking back at a finished step replaces the workspace entirely,
              so there is no chance of typing into a form that will not submit. */}
          {reviewing ? (
            <PastStep
              label={labelFor(reviewing)}
              entry={history[reviewing]}
              onClose={() => setReviewing(null)}
              currentLabel={labelFor(step)}
            />
          ) : (
            <>
              {/* While reviewing the step just submitted, the next step's form
                  stays hidden so the coaching below is the only thing to read. */}
              {pendingStep ? <StepDone label={labelFor(step)} /> : body}
              <FeedbackPanel result={result} loading={busy && Boolean(result)} error={null} />
            </>
          )}
          {pendingStep && !reviewing && (
            <Card>
              <p style={{ margin: `0 0 ${tokens.space(3)}`, color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
                Read the feedback above, then carry on when you are ready.
              </p>
              <Button
                onClick={() => {
                  setStep(pendingStep);
                  setPendingStep(null);
                }}
              >
                {`Continue to ${labelFor(pendingStep).toLowerCase()} →`}
              </Button>
            </Card>
          )}
          {(!attemptId || step === "intro") && !reviewing && (
            <Roadmap steps={STEP_LABELS} currentIndex={currentIndex} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A finished step, read back. Deliberately shows the answer and the coaching
 * with no controls: the submission is already graded and scored server-side,
 * so offering an edit here would be a lie.
 */
function PastStep({
  label,
  entry,
  currentLabel,
  onClose,
}: {
  label: string;
  entry?: { answer: unknown; aiFeedback: unknown; deterministic: unknown };
  currentLabel: string;
  onClose: () => void;
}) {
  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.space(3) }}>
          <div>
            <div style={{ fontSize: tokens.size.xs, textTransform: "uppercase", letterSpacing: 1, color: tokens.color.textFaint }}>
              Looking back
            </div>
            <strong style={{ fontSize: tokens.size.lg }}>{label}</strong>
          </div>
          <Button variant="ghost" onClick={onClose}>{`Back to ${currentLabel.toLowerCase()} →`}</Button>
        </div>
        <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(3)} 0 0` }}>
          Already submitted and scored, so this is read-only.
        </p>
      </Card>

      {entry ? (
        <>
          <Card>
            <strong style={{ fontSize: tokens.size.base }}>What you said</strong>
            <pre
              style={{
                margin: `${tokens.space(2)} 0 0`,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: tokens.font.sans,
                fontSize: tokens.size.sm,
                color: tokens.color.textMuted,
                lineHeight: 1.55,
              }}
            >
              {summariseAnswer(entry.answer)}
            </pre>
          </Card>
          <FeedbackPanel
            result={{
              submissionId: "review",
              attemptNumber: 1,
              currentStep: "completed",
              aiFeedback: entry.aiFeedback ?? null,
              aiStatus: entry.aiFeedback ? "ok" : "unavailable",
              deterministicResult: entry.deterministic ?? null,
              revealedAttackSurfaces: null,
              revealedThreats: null,
              pointsAwarded: 0,
              cheers: [],
            }}
            loading={false}
            error={null}
          />
        </>
      ) : (
        <Card>
          <p style={{ margin: 0, color: tokens.color.textMuted }}>
            Nothing recorded for this step yet.
          </p>
        </Card>
      )}
    </>
  );
}

/** Submissions are step-shaped, not one type — render whichever fields a
 *  given step actually carries rather than dumping raw JSON at the learner. */
function summariseAnswer(answer: unknown): string {
  const a = answer as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return "—";
  if (typeof a.text === "string") return a.text;
  if (Array.isArray(a.threats)) return (a.threats as string[]).map((t) => `• ${t}`).join("\n");
  if (Array.isArray(a.items)) {
    return (a.items as { priority?: string; rationale?: string }[])
      .map((i) => `• ${i.priority ?? "?"} — ${i.rationale ?? ""}`)
      .join("\n");
  }
  if (Array.isArray(a.pairings)) return `${(a.pairings as unknown[]).length} threat/mitigation pairs submitted.`;
  if (typeof a.decision === "string") {
    return `${String(a.decision).replace(/_/g, " ")}\n\n${String(a.rationale ?? "")}`;
  }
  return "—";
}

function labelFor(step: LabStep): string {
  return STEP_LABELS.find((s) => s.step === step)?.label ?? "the next step";
}

/** Placeholder where the step's form was, so the column doesn't jump to the
 *  feedback with no indication of what was just submitted. */
function StepDone({ label }: { label: string }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space(3) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9.2" stroke={tokens.color.accent} strokeWidth="1.7" />
          <path d="M8 12.3l2.7 2.7L16 9.7" stroke={tokens.color.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <strong style={{ fontSize: tokens.size.lg }}>{label} submitted</strong>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: tokens.space(4) }}>
      <div style={{ fontSize: tokens.size.xs, textTransform: "uppercase", letterSpacing: 1, color: tokens.color.textFaint }}>
        {title}
      </div>
      <p style={{ margin: `${tokens.space(1)} 0 0`, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "UNAUTHORIZED") return "Your session expired. Sign in again to continue.";
    return err.message;
  }
  return "Could not reach the server. Your previous answers are safe — try again.";
}
