import { BadRequestException } from "@nestjs/common";
import { stepIndex, type LabStep, type StepResult } from "@curated-labs/shared";

/**
 * Pure grading/ordering logic shared by the curated `AttemptsService` and the
 * playground `PlaygroundAttemptsService`. Extracted so the two forked services
 * cannot silently drift on how a step is graded — no Prisma, no AI, no I/O.
 */

/** Steps must be done in order. Re-submitting the *current* step is allowed
 *  (the retry path for the threats step), but skipping ahead is not. */
export function assertStepAllowed(current: LabStep, target: LabStep): void {
  const currentIdx = stepIndex(current);
  const targetIdx = stepIndex(target);
  if (targetIdx > currentIdx + 1) {
    throw new BadRequestException("Finish the earlier steps first.");
  }
}

/** Replayed idempotent submit: return what was stored, run nothing again. */
export function replayResult(
  submission: { id: string; attemptNumber: number; aiFeedbackJson: unknown; deterministicResultJson: unknown },
  currentStep: LabStep,
): StepResult {
  return {
    submissionId: submission.id,
    attemptNumber: submission.attemptNumber,
    currentStep,
    aiFeedback: submission.aiFeedbackJson ?? null,
    aiStatus: submission.aiFeedbackJson ? "ok" : "unavailable",
    deterministicResult: submission.deterministicResultJson ?? null,
    revealedThreats: null,
    // A replay is a retried request for an answer already scored — the points
    // and cheer already reached the client on the original response.
    pointsAwarded: 0,
    cheers: [],
  };
}

/** Reject threat ids that belong to another lab/scenario before storing anything. */
export function assertKnownThreatIds(items: { threatId: string }[], known: Set<string>): void {
  const unknown = items.filter((i) => !known.has(i.threatId));
  if (unknown.length) throw new BadRequestException("Unknown threat in submission.");
}

export function comparePriorities(
  items: { threatId: string; priority: string; rationale: string }[],
  canonical: { id: string; expectedPriority: string }[],
) {
  return items.map((item) => {
    const threat = canonical.find((t) => t.id === item.threatId)!;
    return {
      threatId: item.threatId,
      learnerPriority: item.priority,
      expectedPriority: threat.expectedPriority,
      matches: item.priority === threat.expectedPriority,
    };
  });
}

/** Correctness is deterministic and computed before the AI runs — the model
 *  explains this verdict; it never produces it. */
export function gradeMitigations(
  pairings: { threatId: string; mitigationId: string }[],
  answerKey: { threatId: string; mitigationId: string }[],
) {
  const valid = new Set(answerKey.map((k) => `${k.threatId}:${k.mitigationId}`));
  const graded = pairings.map((p) => ({
    threatId: p.threatId,
    mitigationId: p.mitigationId,
    isCorrect: valid.has(`${p.threatId}:${p.mitigationId}`),
  }));
  return {
    pairings: graded,
    correctCount: graded.filter((g) => g.isCorrect).length,
    totalCount: graded.length,
  };
}

/** Fixed copy keyed on whether the learner's release decision matches the
 *  lab's recommended one — deterministic so it's reliable regardless of
 *  what the model says in the same response. */
export function releaseHeadline(aligned: boolean): string {
  return aligned
    ? "Great decision! Your reasoning demonstrates sound risk-based thinking. You're well on your way to thinking like a security architect—or perhaps even a future CISO."
    : "Good effort! Threat modeling is about making informed decisions, and there can be multiple valid perspectives. Consider how the identified risks and remaining gaps influence the release decision. Keep practicing—you'll get even better.";
}
