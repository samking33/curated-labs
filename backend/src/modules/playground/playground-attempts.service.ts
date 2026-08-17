// ponytail: this is a deliberate fork of
// backend/src/modules/attempts/attempts.service.ts, not a shared engine. The
// answer key lives in one JSONB column here and in six normalised tables
// there; an abstraction over that saves ~12 lines and costs the compile error
// you want when the two schemas diverge. The PURE parts are shared via
// backend/src/common/workflow.ts: if step order, replay, or grading
// arithmetic changes, change it THERE and both surfaces get it.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  THREAT_RETRY_LIMIT,
  isUuid,
  nextStep,
  stepIndex,
  type LabStep,
  type StepResult,
  deriveAttackSurfaces,
  gradeAttackSurfaces,
} from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AiService, type AiStatus } from "../ai/ai.service";
import { PlaygroundGenerationService } from "./playground-generation.service";
import {
  assertKnownThreatIds,
  assertStepAllowed,
  comparePriorities,
  gradeMitigations,
  replayResult,
} from "../../common/workflow";
import type { AuthContext } from "../../common/guards/session.guard";

type SubmitOptions = { idempotencyKey?: string };

@Injectable()
export class PlaygroundAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly generation: PlaygroundGenerationService, // for answerKey()
  ) {}

  async start(user: AuthContext, scenarioId: string) {
    if (!isUuid(scenarioId)) throw new NotFoundException("Scenario not found.");
    // Ownership check: answerKey() 404s if this scenario isn't the caller's.
    await this.generation.answerKey(scenarioId, user.userId);

    const existing = await this.prisma.playgroundAttempt.findFirst({
      where: { userId: user.userId, scenarioId, status: "in_progress" },
      orderBy: { startedAt: "desc" },
    });
    if (existing) return existing;

    const orgId = user.organizations[0]?.id ?? null;
    return this.prisma.playgroundAttempt.create({
      data: { scenarioId, userId: user.userId, organizationId: orgId, currentStep: "intro" },
    });
  }

  async get(user: AuthContext, attemptId: string) {
    if (!isUuid(attemptId)) throw new NotFoundException("Attempt not found.");
    const attempt = await this.prisma.playgroundAttempt.findUnique({
      where: { id: attemptId },
      include: {
        submissions: { orderBy: { submittedAt: "asc" } },
        scenario: { select: { id: true, title: true } },
      },
    });
    // No canViewAttempt / org-viewer path here on purpose: playground work is
    // personal, and adding a shared-view path later must be a deliberate change.
    if (!attempt || attempt.userId !== user.userId) throw new NotFoundException("Attempt not found.");

    return { ...attempt, revealedThreats: await this.revealedThreatsFor(attempt) };
  }

  private async revealedThreatsFor(attempt: {
    id: string;
    scenarioId: string;
    currentStep: LabStep;
  }): Promise<StepResult["revealedThreats"]> {
    const pastThreats = stepIndex(attempt.currentStep) > stepIndex("threats");
    if (!pastThreats) {
      const revealed = await this.prisma.playgroundStepSubmission.findFirst({
        where: {
          attemptId: attempt.id,
          step: "threats",
          deterministicResultJson: { path: ["revealed"], equals: true },
        },
      });
      if (!revealed) return null;
    }

    const key = await this.generation.answerKey(attempt.scenarioId);
    return key.threats.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      expectedPriority: t.expectedPriority,
      learnerExplanation: t.learnerExplanation,
    }));
  }

  /** Only the owner may write. Reads 404 on ownership mismatch; writes 403,
   *  the same deliberate asymmetry as AttemptsService.loadForWrite. */
  private async loadForWrite(user: AuthContext, attemptId: string) {
    if (!isUuid(attemptId)) throw new NotFoundException("Attempt not found.");
    const attempt = await this.prisma.playgroundAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException("Attempt not found.");
    if (attempt.userId !== user.userId) throw new ForbiddenException("This is not your attempt.");
    if (attempt.status !== "in_progress") throw new BadRequestException("This attempt is already finished.");
    return attempt;
  }

  private async recordSubmission(attemptId: string, step: LabStep, answer: unknown, options: SubmitOptions) {
    if (options.idempotencyKey) {
      const prior = await this.prisma.playgroundStepSubmission.findUnique({
        where: { attemptId_idempotencyKey: { attemptId, idempotencyKey: options.idempotencyKey } },
      });
      if (prior) return { submission: prior, replayed: true as const };
    }

    const priorCount = await this.prisma.playgroundStepSubmission.count({ where: { attemptId, step } });
    const submission = await this.prisma.playgroundStepSubmission.create({
      data: {
        attemptId,
        step,
        attemptNumber: priorCount + 1,
        answerJson: answer as object,
        idempotencyKey: options.idempotencyKey ?? null,
      },
    });
    return { submission, replayed: false as const };
  }

  private async finish(
    attemptId: string,
    submissionId: string,
    step: LabStep,
    ai: { feedback: unknown; status: AiStatus },
    deterministic: unknown,
    advanceTo?: LabStep,
  ) {
    const [submission, attempt] = await this.prisma.$transaction([
      this.prisma.playgroundStepSubmission.update({
        where: { id: submissionId },
        data: {
          aiFeedbackJson: (ai.feedback ?? undefined) as object | undefined,
          deterministicResultJson: (deterministic ?? undefined) as object | undefined,
        },
      }),
      this.prisma.playgroundAttempt.update({
        where: { id: attemptId },
        data: { currentStep: advanceTo ?? nextStep(step) },
      }),
    ]);
    return { submission, attempt };
  }

  /* --------------------------------------------------- step 1: architecture */

  async submitArchitectureIssues(
    user: AuthContext,
    attemptId: string,
    answer: { text: string; referencedNodeIds: string[]; referencedEdgeIds: string[] },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "architecture_issues");

    const { submission, replayed } = await this.recordSubmission(attemptId, "architecture_issues", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const key = await this.generation.answerKey(attempt.scenarioId);
    const ai = await this.ai.architectureFeedback({
      answer,
      issues: key.architectureIssues,
      labId: attempt.scenarioId,
      tone: "generated",
    });

    const missedIds = new Set(((ai.feedback as { missedIssueIds?: string[] } | null)?.missedIssueIds ?? []) as string[]);
    const hints = key.architectureIssues
      .filter((i) => missedIds.has(i.id) && i.hint)
      .map((i) => ({ issueId: i.id, hint: i.hint! }));
    const deterministic = { totalIssues: key.architectureIssues.length, hints };

    const done = await this.finish(attemptId, submission.id, "architecture_issues", ai, deterministic);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: deterministic,
      revealedAttackSurfaces: null,
      revealedThreats: null,
      pointsAwarded: 0,
      cheers: [],
    };
  }

  /* -------------------------------------------------------- step 2: threats */

  /** Same derivation as the curated path: the canonical surfaces come from
   *  the scenario's own DFD, so a generated scenario needs no extra authored
   *  answer key for this step. */
  async submitAttackSurfaces(
    user: AuthContext,
    attemptId: string,
    answer: { text: string; referencedNodeIds: string[]; referencedEdgeIds: string[] },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "attack_surfaces");

    const { submission, replayed } = await this.recordSubmission(attemptId, "attack_surfaces", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const scenario = await this.generation.getScenario(user, attempt.scenarioId);
    const canonical = deriveAttackSurfaces(scenario.dfd);
    const graded = gradeAttackSurfaces(canonical, {
      nodeIds: answer.referencedNodeIds,
      edgeIds: answer.referencedEdgeIds,
    });
    const byId = new Map(canonical.map((c) => [c.id, c]));

    const ai = await this.ai.attackSurfaceFeedback({
      answer,
      identified: graded.identifiedIds.flatMap((id) => byId.get(id) ?? []),
      missed: graded.missedIds.flatMap((id) => byId.get(id) ?? []),
      labId: attempt.scenarioId,
      tone: "generated",
    });

    const done = await this.finish(attemptId, submission.id, "attack_surfaces", ai, graded);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: graded,
      revealedAttackSurfaces: canonical,
      revealedThreats: null,
      pointsAwarded: 0,
      cheers: [],
    };
  }

  async submitThreats(
    user: AuthContext,
    attemptId: string,
    answer: { threats: string[]; referencedNodeIds: string[]; referencedEdgeIds: string[] },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "threats");

    const { submission, replayed } = await this.recordSubmission(attemptId, "threats", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const key = await this.generation.answerKey(attempt.scenarioId);
    const ai = await this.ai.threatMatching({
      answer,
      canonical: key.threats,
      labId: attempt.scenarioId,
      tone: "generated",
    });

    // No learnerThreatMatch table for playground: the matches live only in
    // the submission's aiFeedbackJson.
    const matched = ai.matches ?? [];
    const reveal = submission.attemptNumber >= THREAT_RETRY_LIMIT;
    const matchedIds = new Set(matched.map((m) => m.canonicalThreatId));
    const allMatched = key.threats.length > 0 && key.threats.every((t) => matchedIds.has(t.id));
    const shouldReveal = reveal || allMatched;

    const advanceTo: LabStep = shouldReveal ? "prioritization" : "threats";
    // Shape is load-bearing: revealedThreatsFor() JSON-path queries
    // {revealed:true} to re-serve threats after a reload. Do not rename this key.
    const done = await this.finish(
      attemptId,
      submission.id,
      "threats",
      ai,
      { matchedThreatIds: [...matchedIds], revealed: shouldReveal },
      advanceTo,
    );

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: { matchedThreatIds: [...matchedIds], attemptsUsed: submission.attemptNumber },
      pointsAwarded: 0,
      cheers: [],
      revealedAttackSurfaces: null,
      revealedThreats: shouldReveal
        ? key.threats.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category,
            expectedPriority: t.expectedPriority,
            learnerExplanation: t.learnerExplanation,
          }))
        : null,
    };
  }

  /* -------------------------------------------------- step 3: prioritization */

  async submitPrioritization(
    user: AuthContext,
    attemptId: string,
    answer: { items: { threatId: string; priority: string; rationale: string }[] },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "prioritization");

    const key = await this.generation.answerKey(attempt.scenarioId);
    assertKnownThreatIds(answer.items, new Set(key.threats.map((t) => t.id)));

    const { submission, replayed } = await this.recordSubmission(attemptId, "prioritization", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const ai = await this.ai.priorityFeedback({
      answer,
      canonical: key.threats,
      labId: attempt.scenarioId,
      tone: "generated",
    });
    const comparison = comparePriorities(answer.items, key.threats);

    const done = await this.finish(attemptId, submission.id, "prioritization", ai, { comparison });

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: { comparison },
      revealedAttackSurfaces: null,
      revealedThreats: null,
      pointsAwarded: 0,
      cheers: [],
    };
  }

  /* ---------------------------------------------------- step 4: mitigations */

  async submitMitigations(
    user: AuthContext,
    attemptId: string,
    answer: { pairings: { threatId: string; mitigationId: string }[] },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "mitigations");

    const { submission, replayed } = await this.recordSubmission(attemptId, "mitigations", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const key = await this.generation.answerKey(attempt.scenarioId);
    const deterministic = gradeMitigations(answer.pairings, key.threatMitigations);

    const titleOf = (id: string) =>
      key.threats.find((t) => t.id === id)?.title ?? key.mitigations.find((m) => m.id === id)?.title ?? "?";

    const ai = await this.ai.mitigationFeedback({
      graded: deterministic.pairings,
      answerKey: key.threatMitigations.map((k) => ({
        threatId: k.threatId,
        mitigationId: k.mitigationId,
        explanation: k.explanation,
        threat: { id: k.threatId, title: titleOf(k.threatId) },
        mitigation: { id: k.mitigationId, title: titleOf(k.mitigationId) },
      })),
      labId: attempt.scenarioId,
      tone: "generated",
    });

    const done = await this.finish(attemptId, submission.id, "mitigations", ai, deterministic);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: deterministic,
      revealedAttackSurfaces: null,
      revealedThreats: null,
      pointsAwarded: 0,
      cheers: [],
    };
  }

  /* ------------------------------------------------ step 5: release decision */

  async submitReleaseDecision(
    user: AuthContext,
    attemptId: string,
    answer: { decision: "ship_it" | "ship_with_conditions" | "do_not_ship"; rationale: string; conditions?: string },
    options: SubmitOptions = {},
  ): Promise<StepResult> {
    const attempt = await this.loadForWrite(user, attemptId);
    assertStepAllowed(attempt.currentStep, "release_decision");

    const { submission, replayed } = await this.recordSubmission(attemptId, "release_decision", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const key = await this.generation.answerKey(attempt.scenarioId);
    const priorSubmissions = await this.prisma.playgroundStepSubmission.findMany({
      where: { attemptId, step: { in: ["architecture_issues", "threats", "mitigations"] } },
      orderBy: { submittedAt: "desc" },
    });

    const ai = await this.ai.releaseFeedback({
      answer,
      guidance: key.releaseGuidance,
      priorSubmissions,
      labId: attempt.scenarioId,
      tone: "generated",
    });

    // No LearnerReleaseDecision row for playground: the decision lives in
    // answerJson. Own transaction (not finish()): this step completes the
    // attempt instead of advancing to another step.
    await this.prisma.$transaction([
      this.prisma.playgroundStepSubmission.update({
        where: { id: submission.id },
        data: { aiFeedbackJson: (ai.feedback ?? undefined) as object | undefined },
      }),
      this.prisma.playgroundAttempt.update({
        where: { id: attemptId },
        data: { status: "completed", currentStep: "completed", completedAt: new Date() },
      }),
    ]);

    return {
      submissionId: submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: "completed",
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: null,
      revealedAttackSurfaces: null,
      revealedThreats: null,
      pointsAwarded: 0,
      cheers: [],
    };
  }
}
