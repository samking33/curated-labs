"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { THREAT_RETRY_LIMIT, type DfdSelection, type LabDetail, type LabStep, type StepResult } from "@curated-labs/shared";
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
  MitigationMatchingStep,
  PrioritizationStep,
  ReleaseDecisionStep,
  ThreatIdentificationStep,
  type RevealedThreat,
} from "./steps";

const STEP_LABELS: { step: LabStep; label: string }[] = [
  { step: "intro", label: "Brief" },
  { step: "architecture_issues", label: "Architecture" },
  { step: "threats", label: "Threats" },
  { step: "prioritization", label: "Priority" },
  { step: "mitigations", label: "Mitigations" },
  { step: "release_decision", label: "Decision" },
];

const ENDPOINT: Partial<Record<LabStep, string>> = {
  architecture_issues: "architecture-issues",
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
          submissions: { step: LabStep; aiFeedbackJson: unknown; deterministicResultJson: unknown; attemptNumber: number; id: string }[];
        }>(`${attemptBase}/${initialAttemptId}`);
        if (cancelled) return;

        setStep(attempt.currentStep === "intro" ? "intro" : attempt.currentStep);
        if (attempt.revealedThreats) setThreats(attempt.revealedThreats);

        // Put the most recent coaching back on screen so returning mid-lab does
        // not look like the previous answer vanished.
        setThreatAttempts(attempt.submissions.filter((sub) => sub.step === "threats").length);

        const last = attempt.submissions.at(-1);
        if (last) {
          setResult({
            submissionId: last.id,
            attemptNumber: last.attemptNumber,
            currentStep: attempt.currentStep,
            aiFeedback: last.aiFeedbackJson ?? null,
            aiStatus: last.aiFeedbackJson ? "ok" : "unavailable",
            deterministicResult: last.deterministicResultJson ?? null,
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
        if (res.revealedThreats?.length) setThreats(res.revealedThreats);
        if (res.cheers.length > 0) {
          setCheer({ key: res.submissionId, points: res.pointsAwarded, cheers: res.cheers });
        }
        setStep(res.currentStep);
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
          {body}
          <FeedbackPanel result={result} loading={busy && Boolean(result)} error={null} />
          {(!attemptId || step === "intro") && (
            <Roadmap steps={STEP_LABELS} currentIndex={currentIndex} />
          )}
        </div>
      </div>
    </div>
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
