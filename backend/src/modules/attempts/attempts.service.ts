import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  POINTS,
  THREAT_RETRY_LIMIT,
  deriveAttackSurfaces,
  extractFromDrawioXml,
  gradeAttackSurfaces,
  can,
  canViewAttempt,
  isUuid,
  nextStep,
  stepIndex,
  type LabStep,
  type StepResult,
} from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { PointsService, type PointCandidate } from "../points/points.service";
import type { AuthContext } from "../../common/guards/session.guard";
import {
  assertKnownThreatIds,
  assertStepAllowed,
  comparePriorities,
  gradeMitigations,
  releaseHeadline,
  replayResult,
} from "../../common/workflow";

type SubmitOptions = { idempotencyKey?: string };

/** Every flat, once-per-attempt award uses this as its dedupe key. Real
 *  threat/mitigation ids are used instead where the award is per-answer. */
const SINGLE = "single";

/**
 * The guided lab workflow.
 *
 * Two invariants drive the whole class:
 *   1. The learner's answer is committed before any AI call. A NIM outage then
 *      degrades coaching but can never destroy work.
 *   2. Correctness is computed here, from the database answer key: the model
 *      only ever explains a verdict we already reached.
 */
@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly points: PointsService,
  ) {}

  /** Awards candidates for this attempt and returns {pointsAwarded, cheers}
   *  ready to splice into a StepResult. Never awards on a replayed submit:
   *  callers only reach this from the non-replayed branch. */
  private async scoreAndCheer(
    attempt: { userId: string; organizationId: string | null; id: string },
    candidates: PointCandidate[],
  ): Promise<{ pointsAwarded: number; cheers: string[] }> {
    const awarded = await this.points.awardMany(
      { userId: attempt.userId, organizationId: attempt.organizationId, attemptId: attempt.id },
      candidates,
    );
    return {
      pointsAwarded: awarded.reduce((sum, a) => sum + a.amount, 0),
      cheers: this.points.cheersFor(awarded),
    };
  }

  async start(user: AuthContext, labSlugOrId: string) {
    const lab = await this.prisma.lab.findFirst({
      // Guard the id branch: a slug compared against a uuid column errors in
      // Postgres, which would surface as a 500 instead of "lab not found".
      where: {
        status: "published",
        OR: [{ slug: labSlugOrId }, ...(isUuid(labSlugOrId) ? [{ id: labSlugOrId }] : [])],
      },
      orderBy: { version: "desc" },
      include: { dfds: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!lab) throw new NotFoundException("Lab not found.");

    // Resume rather than fork, so a learner can leave and come back.
    const existing = await this.prisma.labAttempt.findFirst({
      where: { userId: user.userId, labId: lab.id, status: "in_progress" },
      orderBy: { startedAt: "desc" },
    });
    if (existing) return existing;

    // Pin the org/department at start so later membership changes don't
    // retroactively move someone else's completed work between departments.
    const membership = user.organizations[0];
    const department = membership
      ? await this.prisma.departmentMembership.findFirst({
          where: { userId: user.userId, department: { organizationId: membership.id } },
        })
      : null;

    return this.prisma.labAttempt.create({
      data: {
        labId: lab.id,
        labVersion: lab.version,
        labContentHash: lab.contentHash,
        dfdVersion: lab.dfds[0]?.version ?? 1,
        userId: user.userId,
        organizationId: membership?.id ?? null,
        departmentId: department?.departmentId ?? null,
        currentStep: "intro",
      },
    });
  }

  async get(user: AuthContext, attemptId: string) {
    if (!isUuid(attemptId)) throw new NotFoundException("Attempt not found.");
    const attempt = await this.prisma.labAttempt.findUnique({
      where: { id: attemptId },
      include: {
        submissions: { orderBy: { submittedAt: "asc" } },
        lab: { select: { title: true, slug: true } },
      },
    });
    if (!attempt) throw new NotFoundException("Attempt not found.");

    const ctx = user.accessFor(attempt.organizationId);
    if (!canViewAttempt(ctx, attempt, user.userId)) {
      throw new NotFoundException("Attempt not found.");
    }

    // Steps 3 and 4 are built from the canonical threat list, so a learner who
    // reloads mid-lab needs it back or those steps render empty and the lab
    // becomes unfinishable. Only ever sent once the attempt has actually earned
    // the reveal: never on the strength of the client asking.
    return { ...attempt, revealedThreats: await this.revealedThreatsFor(attempt) };
  }

  /**
   * The canonical set, but only if this attempt already passed the reveal gate:
   * either it moved beyond the threats step, or a threats submission recorded
   * `revealed`. Returns null otherwise.
   */
  private async revealedThreatsFor(attempt: {
    id: string;
    labId: string;
    currentStep: LabStep;
  }): Promise<StepResult["revealedThreats"]> {
    const pastThreats = stepIndex(attempt.currentStep) > stepIndex("threats");
    if (!pastThreats) {
      const revealed = await this.prisma.labStepSubmission.findFirst({
        where: {
          attemptId: attempt.id,
          step: "threats",
          deterministicResultJson: { path: ["revealed"], equals: true },
        },
      });
      if (!revealed) return null;
    }

    const threats = await this.prisma.labThreat.findMany({
      where: { labId: attempt.labId },
      orderBy: { sortOrder: "asc" },
    });
    return threats.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      expectedPriority: t.expectedPriority,
      learnerExplanation: t.learnerExplanation,
    }));
  }

  /** Only the owner may write; viewers with org scope are read-only. */
  private async loadForWrite(user: AuthContext, attemptId: string) {
    if (!isUuid(attemptId)) throw new NotFoundException("Attempt not found.");
    const attempt = await this.prisma.labAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException("Attempt not found.");
    if (attempt.userId !== user.userId) throw new ForbiddenException("This is not your attempt.");
    if (attempt.status !== "in_progress") throw new BadRequestException("This attempt is already finished.");
    return attempt;
  }

  private async recordSubmission(
    attemptId: string,
    step: LabStep,
    answer: unknown,
    options: SubmitOptions,
  ) {
    // Idempotency: a retried POST returns the original row rather than
    // duplicating the answer and spending another AI call.
    if (options.idempotencyKey) {
      const prior = await this.prisma.labStepSubmission.findUnique({
        where: { attemptId_idempotencyKey: { attemptId, idempotencyKey: options.idempotencyKey } },
      });
      if (prior) return { submission: prior, replayed: true as const };
    }

    const priorCount = await this.prisma.labStepSubmission.count({ where: { attemptId, step } });
    const submission = await this.prisma.labStepSubmission.create({
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

  /**
   * Records the graded result and moves the attempt on.
   *
   * The position only ever moves forwards. Submitting a step the learner has
   * already passed used to set the position to whatever followed THAT step,
   * so re-answering step one from the decision step dropped them back to
   * attack surfaces with five steps of progress apparently undone. A late
   * retry of an earlier submission is a normal thing for a client to do, so
   * the answer is to keep the later position rather than to refuse the write.
   */
  private async finish(
    attemptId: string,
    submissionId: string,
    step: LabStep,
    ai: { feedback: unknown; status: "ok" | "unavailable" | "invalid" },
    deterministic: unknown,
    advanceTo?: LabStep,
    currentStep?: LabStep,
  ) {
    const proposed = advanceTo ?? nextStep(step);
    const target =
      currentStep && stepIndex(currentStep) > stepIndex(proposed) ? currentStep : proposed;
    const [submission, attempt] = await this.prisma.$transaction([
      this.prisma.labStepSubmission.update({
        where: { id: submissionId },
        data: {
          aiFeedbackJson: (ai.feedback ?? undefined) as object | undefined,
          deterministicResultJson: (deterministic ?? undefined) as object | undefined,
        },
      }),
      this.prisma.labAttempt.update({
        where: { id: attemptId },
        data: { currentStep: target },
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

    const issues = await this.prisma.labArchitectureIssue.findMany({
      where: { labId: attempt.labId },
      orderBy: { sortOrder: "asc" },
    });

    const ai = await this.ai.architectureFeedback({ answer, issues, labId: attempt.labId });

    // Hints for what they missed: the nudge, never the answer. The issue title
    // and description stay server-side; only the curated hint text is sent.
    const missedIds = new Set(
      ((ai.feedback as { missedIssueIds?: string[] } | null)?.missedIssueIds ?? []) as string[],
    );
    const hints = issues
      .filter((i) => missedIds.has(i.id) && i.hint)
      .map((i) => ({ issueId: i.id, hint: i.hint! }));

    const deterministic = {
      totalIssues: issues.length,
      hints,
    };
    const done = await this.finish(attemptId, submission.id, "architecture_issues", ai, deterministic, undefined, attempt.currentStep);

    // Flat participation award: this step is explicitly not graded, so
    // there is nothing to cheer about, only credit for having done it.
    const { pointsAwarded } = await this.scoreAndCheer(attempt, [
      { reason: "architecture_submitted", refId: SINGLE, amount: POINTS.architecture_submitted },
    ]);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: deterministic,
      revealedAttackSurfaces: null,
    revealedThreats: null,
      pointsAwarded,
      cheers: [],
    };
  }

  /* ------------------------------------------------ step 1b: attack surfaces */

  /**
   * Where untrusted input enters. The canonical set is derived from the DFD
   * (deriveAttackSurfaces) rather than authored per lab: an attack surface is
   * a property of the architecture, so computing it keeps the answer key
   * correct for generated scenarios and for any lab whose diagram is edited.
   *
   * Correctness comes from which nodes/edges the learner attached, decided
   * here before the model is called; the coach only explains that verdict.
   */
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

    const graph = await this.graphFor(attempt.labId);
    const canonical = deriveAttackSurfaces(graph);
    const graded = gradeAttackSurfaces(canonical, {
      nodeIds: answer.referencedNodeIds,
      edgeIds: answer.referencedEdgeIds,
    });

    const byId = new Map(canonical.map((c) => [c.id, c]));
    const ai = await this.ai.attackSurfaceFeedback({
      answer,
      identified: graded.identifiedIds.flatMap((id) => byId.get(id) ?? []),
      missed: graded.missedIds.flatMap((id) => byId.get(id) ?? []),
      labId: attempt.labId,
    });

    const done = await this.finish(attemptId, submission.id, "attack_surfaces", ai, graded, undefined, attempt.currentStep);

    const candidates: PointCandidate[] = graded.identifiedIds.map((id) => ({
      reason: "attack_surface_identified",
      refId: id,
      amount: POINTS.attack_surface_identified,
    }));
    const { pointsAwarded, cheers } = await this.scoreAndCheer(attempt, candidates);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: graded,
      // Shown straight after grading so the learner can compare: this is the
      // teaching moment for the step, and nothing here is a hidden answer key
      // for a later one.
      revealedAttackSurfaces: canonical,
      revealedThreats: null,
      pointsAwarded,
      cheers,
    };
  }

  /** The lab's current DFD as a graph, for steps that reason about structure. */
  private async graphFor(labId: string) {
    const dfd = await this.prisma.labDfd.findFirst({
      where: { labId },
      orderBy: { version: "desc" },
      select: { drawioXml: true },
    });
    if (!dfd) throw new NotFoundException("This lab has no diagram yet.");
    return extractFromDrawioXml(dfd.drawioXml);
  }

  /* -------------------------------------------------------- step 2: threats */

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

    const canonical = await this.prisma.labThreat.findMany({
      where: { labId: attempt.labId },
      orderBy: { sortOrder: "asc" },
    });

    const ai = await this.ai.threatMatching({ answer, canonical, labId: attempt.labId });

    // Persist matches with real canonical ids only. AiService has already
    // dropped anything the model invented.
    const matched = ai.matches ?? [];
    if (matched.length) {
      await this.prisma.learnerThreatMatch.createMany({
        data: matched.map((m) => ({
          submissionId: submission.id,
          canonicalThreatId: m.canonicalThreatId,
          learnerText: m.learnerText,
          matchConfidence: m.confidence,
          matchReason: m.reason,
        })),
      });
    }

    // step 2: after the configured number of tries, show the answer set.
    // The decision is ours, not the model's: it cannot reveal answers early.
    const reveal = submission.attemptNumber >= THREAT_RETRY_LIMIT;
    const matchedIds = new Set(matched.map((m) => m.canonicalThreatId));
    const allMatched = canonical.length > 0 && canonical.every((t) => matchedIds.has(t.id));
    const shouldReveal = reveal || allMatched;

    // Hold the learner on this step until they have another go or earn reveal.
    const advanceTo: LabStep = shouldReveal ? "prioritization" : "threats";
    const done = await this.finish(
      attemptId,
      submission.id,
      "threats",
      ai,
      { matchedThreatIds: [...matchedIds], revealed: shouldReveal },
      advanceTo,
      attempt.currentStep,
    );

    // One award per matched canonical threat, deduped per attempt: matching
    // the same threat again on a retry earns nothing further, only threats
    // that are newly matched on THIS submission pay out.
    const candidates: PointCandidate[] = [...matchedIds].map((id) => ({
      reason: "threat_matched",
      refId: id,
      amount: POINTS.threat_matched,
    }));
    if (allMatched) {
      candidates.push({ reason: "threats_clean_sweep", refId: SINGLE, amount: POINTS.threats_clean_sweep });
    }
    const { pointsAwarded, cheers } = await this.scoreAndCheer(attempt, candidates);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: { matchedThreatIds: [...matchedIds], attemptsUsed: submission.attemptNumber },
      pointsAwarded,
      cheers,
      revealedAttackSurfaces: null,
      revealedThreats: shouldReveal
        ? canonical.map((t) => ({
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

    const canonical = await this.prisma.labThreat.findMany({ where: { labId: attempt.labId } });
    assertKnownThreatIds(answer.items, new Set(canonical.map((t) => t.id)));

    const { submission, replayed } = await this.recordSubmission(attemptId, "prioritization", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    const ai = await this.ai.priorityFeedback({ answer, canonical, labId: attempt.labId });
    const comparison = comparePriorities(answer.items, canonical);

    const done = await this.finish(attemptId, submission.id, "prioritization", ai, { comparison }, undefined, attempt.currentStep);

    const candidates: PointCandidate[] = comparison
      .filter((c) => c.matches)
      .map((c) => ({ reason: "priority_correct", refId: c.threatId, amount: POINTS.priority_correct }));
    const { pointsAwarded, cheers } = await this.scoreAndCheer(attempt, candidates);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: { comparison },
      revealedAttackSurfaces: null,
    revealedThreats: null,
      pointsAwarded,
      cheers,
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

    const answerKey = await this.prisma.labThreatMitigation.findMany({
      where: { threat: { labId: attempt.labId } },
      include: { threat: { select: { id: true, title: true } }, mitigation: { select: { id: true, title: true } } },
    });

    const { submission, replayed } = await this.recordSubmission(attemptId, "mitigations", answer, options);
    if (replayed) return replayResult(submission, attempt.currentStep);

    // step 4: correctness is deterministic and computed BEFORE the AI runs.
    // The model explains this verdict; it never produces it.
    const deterministic = gradeMitigations(answer.pairings, answerKey);
    const graded = deterministic.pairings;

    const ai = await this.ai.mitigationFeedback({ graded, answerKey, labId: attempt.labId });
    const done = await this.finish(attemptId, submission.id, "mitigations", ai, deterministic, undefined, attempt.currentStep);

    const candidates: PointCandidate[] = graded
      .filter((g) => g.isCorrect)
      .map((g) => ({
        reason: "mitigation_correct",
        refId: `${g.threatId}:${g.mitigationId}`,
        amount: POINTS.mitigation_correct,
      }));
    const { pointsAwarded, cheers } = await this.scoreAndCheer(attempt, candidates);

    return {
      submissionId: done.submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: done.attempt.currentStep,
      aiFeedback: ai.feedback,
      aiStatus: ai.status,
      deterministicResult: deterministic,
      revealedAttackSurfaces: null,
    revealedThreats: null,
      pointsAwarded,
      cheers,
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

    const guidance = await this.prisma.labReleaseGuidance.findUnique({ where: { labId: attempt.labId } });
    const priorSubmissions = await this.prisma.labStepSubmission.findMany({
      where: { attemptId, step: { in: ["architecture_issues", "threats", "mitigations"] } },
      orderBy: { submittedAt: "desc" },
    });

    const ai = await this.ai.releaseFeedback({ answer, guidance, priorSubmissions, labId: attempt.labId });

    // The headline is fixed copy keyed on a deterministic alignment check,
    // not something the model writes: a canned string is more reliable
    // than hoping every model call reproduces it verbatim. It sits beside
    // the model's own (deliberately non-judgmental) reasoning, not in place
    // of it: guidance.recommendedDecision is one defensible answer, not the
    // only one, so this never overrides ai.feedback's own framing.
    const aligned = guidance ? guidance.recommendedDecision === answer.decision : null;
    const feedback =
      ai.feedback && aligned !== null
        ? { ...ai.feedback, headline: releaseHeadline(aligned) }
        : ai.feedback;

    await this.prisma.$transaction([
      this.prisma.learnerReleaseDecision.upsert({
        where: { attemptId },
        create: {
          attemptId,
          decision: answer.decision,
          rationale: answer.rationale,
          conditions: answer.conditions ?? null,
          aiFeedbackJson: (feedback ?? undefined) as object | undefined,
        },
        update: {
          decision: answer.decision,
          rationale: answer.rationale,
          conditions: answer.conditions ?? null,
          aiFeedbackJson: (feedback ?? undefined) as object | undefined,
        },
      }),
      this.prisma.labStepSubmission.update({
        where: { id: submission.id },
        data: { aiFeedbackJson: (feedback ?? undefined) as object | undefined },
      }),
      this.prisma.labAttempt.update({
        where: { id: attemptId },
        data: { status: "completed", currentStep: "completed", completedAt: new Date() },
      }),
    ]);

    // Submitting the decision and finishing the lab are two separate awards,
    // granted together since they happen in the same request.
    const { pointsAwarded, cheers } = await this.scoreAndCheer(attempt, [
      { reason: "release_submitted", refId: SINGLE, amount: POINTS.release_submitted },
      { reason: "lab_completed", refId: SINGLE, amount: POINTS.lab_completed },
    ]);

    return {
      submissionId: submission.id,
      attemptNumber: submission.attemptNumber,
      currentStep: "completed",
      aiFeedback: feedback,
      aiStatus: ai.status,
      deterministicResult: null,
      revealedAttackSurfaces: null,
    revealedThreats: null,
      pointsAwarded,
      cheers,
    };
  }

  /* -------------------------------------------------------------- progress */

  async progressForUser(userId: string) {
    const attempts = await this.prisma.labAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      include: { lab: { select: { title: true, slug: true } }, _count: { select: { submissions: true } } },
    });

    /*
     * What the learner actually did on each day of this week.
     *
     * The dashboard's day strip used to colour every day before today as
     * done, which said nothing about whether the learner had worked. These
     * are real submissions, so an empty day reads as empty and a day can be
     * opened to see what happened on it.
     *
     * Bucketed against the server's clock, which is the same reference the
     * dashboard uses to decide which day is today.
     */
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const submissions = await this.prisma.labStepSubmission.findMany({
      where: { attempt: { userId }, submittedAt: { gte: weekStart } },
      orderBy: { submittedAt: "asc" },
      select: {
        step: true,
        submittedAt: true,
        attempt: { select: { lab: { select: { title: true, slug: true } } } },
      },
    });

    const week = Array.from({ length: 7 }, () => [] as {
      labTitle: string;
      labSlug: string;
      step: string;
      at: string;
    }[]);
    for (const sub of submissions) {
      const index = Math.floor((sub.submittedAt.getTime() - weekStart.getTime()) / 86_400_000);
      if (index < 0 || index > 6) continue;
      week[index]!.push({
        labTitle: sub.attempt.lab.title,
        labSlug: sub.attempt.lab.slug,
        step: sub.step,
        at: sub.submittedAt.toISOString(),
      });
    }

    return {
      labsStarted: attempts.length,
      labsCompleted: attempts.filter((a) => a.status === "completed").length,
      stepsSubmitted: attempts.reduce((sum, a) => sum + a._count.submissions, 0),
      week,
      recent: attempts.slice(0, 10).map((a) => ({
        attemptId: a.id,
        labTitle: a.lab.title,
        labSlug: a.lab.slug,
        status: a.status,
        currentStep: a.currentStep,
        startedAt: a.startedAt.toISOString(),
      })),
    };
  }

  /**
   * Organization progress. Department managers see only their own
   * departments: the filter is applied here rather than trusted from a query
   * parameter.
   */
  async progressForOrganization(user: AuthContext, organizationId: string, departmentId?: string) {
    if (!isUuid(organizationId)) throw new NotFoundException("Organization not found.");
    const ctx = user.accessFor(organizationId);

    // Deny before querying. accessFor() returns orgRole: null for a non-member,
    // so without this a learner could enumerate organization ids and read other
    // companies' learner names, emails and activity.
    if (!can(ctx, "progress:view_org")) {
      throw new NotFoundException("Organization not found.");
    }

    const limited = ctx.orgRole === "department_manager" && !ctx.platformRoles.includes("platform_owner");
    const allowedDepartments = limited ? ctx.managedDepartmentIds ?? [] : null;

    if (limited && departmentId && !allowedDepartments!.includes(departmentId)) {
      throw new ForbiddenException("You do not manage this department.");
    }

    const attempts = await this.prisma.labAttempt.findMany({
      where: {
        organizationId,
        ...(departmentId ? { departmentId } : {}),
        ...(allowedDepartments ? { departmentId: { in: allowedDepartments } } : {}),
      },
      include: {
        lab: { select: { title: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 500,
    });

    return {
      totals: {
        attempts: attempts.length,
        completed: attempts.filter((a) => a.status === "completed").length,
        learners: new Set(attempts.map((a) => a.userId)).size,
      },
      attempts: attempts.map((a) => ({
        attemptId: a.id,
        learner: { id: a.user.id, name: a.user.name, email: a.user.email },
        department: a.department ? { id: a.department.id, name: a.department.name } : null,
        labTitle: a.lab.title,
        status: a.status,
        currentStep: a.currentStep,
        startedAt: a.startedAt.toISOString(),
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Replayed idempotent submit: return what was stored, run nothing again. */
  private replay(
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
      revealedAttackSurfaces: null,
    revealedThreats: null,
      // A replay is a retried request for an answer already scored: the
      // points and cheer already reached the client on the original response.
      pointsAwarded: 0,
      cheers: [],
    };
  }

  static contentHash(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  }
}
