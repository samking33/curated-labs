import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  checkDfdReferences,
  compileToDrawioXml,
  extractFromDrawioXml,
  isUuid,
  playgroundScenarioContentSchema,
  validateGeneratedScenario,
  type GenerateScenarioRequest,
  type GenerationJob,
  type LabDetail,
  type LabSummary,
  type PlaygroundScenarioContent,
  type PlaygroundScenarioDraft,
} from "@curated-labs/shared";
import { CONFIG, type AppConfig } from "../../config";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AiService } from "../ai/ai.service";
import { AUTHOR_PROMPT_VERSION, AUTHOR_SENTINEL } from "../ai/prompts";
import type { AuthContext } from "../../common/guards/session.guard";

/**
 * Owns Custom Playground sessions and scenario generation (PLAYGROUND_PROJECT.md).
 *
 * Generation is async by design: the sole viable generator model measures
 * ~85s and ~6-7k output tokens (see docs/gen-bench notes), far past what a
 * synchronous request should hold open. `requestGeneration` enqueues and
 * returns immediately; the client polls `jobStatus` until it settles.
 */
@Injectable()
export class PlaygroundGenerationService {
  private readonly logger = new Logger(PlaygroundGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /* ------------------------------------------------------------- sessions */

  async createSession(user: AuthContext, title: string) {
    const orgId = user.organizations[0]?.id ?? null;
    return this.prisma.playgroundSession.create({
      data: { userId: user.userId, organizationId: orgId, title },
      select: { id: true, title: true, createdAt: true },
    });
  }

  async listSessions(user: AuthContext) {
    return this.prisma.playgroundSession.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    });
  }

  private async loadOwnedSession(user: AuthContext, sessionId: string) {
    if (!isUuid(sessionId)) throw new NotFoundException("Session not found.");
    const session = await this.prisma.playgroundSession.findUnique({ where: { id: sessionId } });
    // 404, not 403: confirming a session id exists for someone else's account
    // is itself information a stranger should not get from this endpoint.
    if (!session || session.userId !== user.userId) throw new NotFoundException("Session not found.");
    return session;
  }

  /* ------------------------------------------------------------ generation */

  /** Enqueues and returns immediately. Quota is enforced inside the insert txn. */
  async requestGeneration(
    user: AuthContext,
    sessionId: string,
    body: GenerateScenarioRequest,
    options: { idempotencyKey?: string } = {},
  ): Promise<GenerationJob> {
    await this.loadOwnedSession(user, sessionId);

    // Idempotency first: a retried POST must not consume a second quota slot.
    if (options.idempotencyKey) {
      const prior = await this.prisma.playgroundGenerationJob.findUnique({
        where: { userId_idempotencyKey: { userId: user.userId, idempotencyKey: options.idempotencyKey } },
      });
      if (prior) return this.toJob(prior);
    }
    const orgId = user.organizations[0]?.id ?? null;

    const job = await this.prisma.$transaction(async (tx) => {
      // Serialises this user's quota check against itself — closes the
      // read-then-insert race a plain COUNT would leave open between two
      // concurrent requests.
      // ponytail: per-user advisory lock only. Org ceiling is 5x the user
      // ceiling, so a race there is a much smaller overshoot; add a second
      // lock on the org id if that ever needs to be exact.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.userId}))`;

      const since = new Date(Date.now() - this.config.PLAYGROUND_QUOTA_WINDOW_HOURS * 3_600_000);
      // A `failed` job still cost one NIM call, but charging a learner for the
      // validator's strictness is user-hostile — it does not count against quota.
      const window = { createdAt: { gte: since }, status: { not: "failed" as const } };

      const mine = await tx.playgroundGenerationJob.count({ where: { ...window, userId: user.userId } });
      if (mine >= this.config.PLAYGROUND_GEN_PER_USER) {
        throw new HttpException("Daily scenario limit reached. Try again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
      }
      if (orgId) {
        const org = await tx.playgroundGenerationJob.count({ where: { ...window, organizationId: orgId } });
        if (org >= this.config.PLAYGROUND_GEN_PER_ORG) {
          throw new HttpException(
            "Your organization's daily scenario limit is reached.",
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      return tx.playgroundGenerationJob.create({
        data: {
          sessionId,
          userId: user.userId,
          organizationId: orgId,
          prompt: body.prompt,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });
    });

    // ponytail: in-process fire-and-forget — no queue exists (docs/redis-later.md).
    // A restart mid-generation strands a `running` row; jobStatus() reaps it.
    // Upgrade path: BullMQ once Redis exists, same job row as the record.
    void this.runJob(job.id, body.difficulty).catch((err) =>
      this.logger.error({ err, jobId: job.id }, "generation job crashed"),
    );
    return this.toJob(job);
  }

  async jobStatus(user: AuthContext, jobId: string): Promise<GenerationJob> {
    if (!isUuid(jobId)) throw new NotFoundException("Job not found.");
    const job = await this.prisma.playgroundGenerationJob.findUnique({
      where: { id: jobId },
      include: { scenario: { select: { id: true } } },
    });
    if (!job || job.userId !== user.userId) throw new NotFoundException("Job not found."); // 404 on read, never 403

    if (
      job.status === "running" &&
      job.startedAt &&
      Date.now() - job.startedAt.getTime() > this.config.PLAYGROUND_STALE_JOB_MS
    ) {
      const reaped = await this.prisma.playgroundGenerationJob.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), errorMessage: "Generation was interrupted. Try again." },
      });
      return this.toJob(reaped);
    }
    return this.toJob(job);
  }

  /**
   * The validation pipeline: validate everything, write nothing until it all
   * passes (mirrors backend/prisma/seed/seed.ts). One generate + one repair
   * attempt, per PLAYGROUND_PROJECT.md — never more.
   */
  private async runJob(jobId: string, difficulty?: GenerateScenarioRequest["difficulty"]) {
    const job = await this.prisma.playgroundGenerationJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date() },
    });

    let priorErrors: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ai = await this.ai.generateScenario({
        sessionId: job.sessionId,
        prompt: job.prompt,
        difficulty,
        priorErrors,
      });
      const draft = ai.feedback;
      if (!draft) {
        priorErrors = ["the model returned nothing usable"];
        continue;
      }

      const errors = validateGeneratedScenario(draft, AUTHOR_SENTINEL);
      if (errors.length) {
        // Logged, never returned — these are error strings about the model's
        // own draft, not something safe to hand back to the learner verbatim.
        this.logger.warn({ jobId, errors }, "generated scenario rejected validation");
        priorErrors = errors;
        continue;
      }

      await this.persist(job, draft, ai.model ?? "unknown");
      return;
    }

    await this.prisma.playgroundGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: "Couldn't build a valid scenario from that description. Try describing the system in more detail.",
      },
    });
  }

  /** Mints real UUIDs for every author key, builds the persisted content, and
   *  inserts scenario + flips the job to succeeded — all in one transaction. */
  private async persist(
    job: { id: string; sessionId: string; userId: string; organizationId: string | null },
    draft: PlaygroundScenarioDraft,
    modelId: string,
  ) {
    const issueId = new Map(draft.architectureIssues.map((i) => [i.key, randomUUID()]));
    const threatId = new Map(draft.threats.map((t) => [t.key, randomUUID()]));
    const mitigationId = new Map(draft.mitigations.map((m) => [m.key, randomUUID()]));

    // Author keys are discarded here — the learner-facing submission schemas
    // require z.string().uuid(), so downstream code speaks the same id
    // dialect as a curated lab regardless of how this scenario was authored.
    const dfdXml = compileToDrawioXml(draft.dfd);
    const content: PlaygroundScenarioContent = playgroundScenarioContentSchema.parse({
      lab: draft.lab,
      architectureIssues: draft.architectureIssues.map((i) => ({
        id: issueId.get(i.key),
        title: i.title,
        description: i.description,
        affectedNodeIds: i.affectedNodeIds,
        affectedEdgeIds: i.affectedEdgeIds,
        hint: i.hint ?? null,
      })),
      threats: draft.threats.map((t) => ({
        id: threatId.get(t.key),
        title: t.title,
        description: t.description,
        category: t.category,
        expectedPriority: t.expectedPriority,
        affectedNodeIds: t.affectedNodeIds,
        affectedEdgeIds: t.affectedEdgeIds,
        acceptedAliases: t.acceptedAliases,
        learnerExplanation: t.learnerExplanation ?? null,
        sortOrder: 0,
      })),
      mitigations: draft.mitigations.map((m) => ({
        id: mitigationId.get(m.key),
        title: m.title,
        description: m.description,
        sortOrder: 0,
      })),
      threatMitigations: draft.threatMitigations.map((link) => ({
        threatId: threatId.get(link.threatKey),
        mitigationId: mitigationId.get(link.mitigationKey),
        isPrimary: link.isPrimary,
        explanation: link.explanation ?? null,
      })),
      releaseGuidance: draft.releaseGuidance,
    });

    const scenario = await this.prisma.$transaction(async (tx) => {
      const created = await tx.playgroundGeneratedScenario.create({
        data: {
          sessionId: job.sessionId,
          jobId: job.id,
          userId: job.userId,
          title: content.lab.title,
          contentJson: content as object,
          dfdXml,
          modelId,
          promptVersion: AUTHOR_PROMPT_VERSION,
        },
      });
      await tx.playgroundGenerationJob.update({
        where: { id: job.id },
        data: { status: "succeeded", finishedAt: new Date() },
      });
      return created;
    });

    await this.audit.record({
      actorUserId: job.userId,
      organizationId: job.organizationId,
      action: "playground.scenario.generated",
      targetType: "playground_scenario",
      targetId: scenario.id,
    });
  }

  /* -------------------------------------------------------------- reading */

  async listScenarios(user: AuthContext): Promise<LabSummary[]> {
    const scenarios = await this.prisma.playgroundGeneratedScenario.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      include: { attempts: { orderBy: { startedAt: "desc" }, take: 1 } },
    });
    return scenarios.map((s) => {
      const content = playgroundScenarioContentSchema.parse(s.contentJson);
      const attempt = s.attempts[0];
      return {
        id: s.id,
        slug: s.id, // playground has no slug routing
        title: content.lab.title,
        summary: content.lab.summary,
        difficulty: content.lab.difficulty,
        estimatedMinutes: content.lab.estimatedMinutes,
        category: { id: "playground", name: "Playground", slug: "playground" },
        attempt: attempt ? { id: attempt.id, status: attempt.status, currentStep: attempt.currentStep } : null,
      };
    });
  }

  /** Owner-only. Learner-facing projection; return type LabDetail makes an
   *  answer-key leak a compile error (shared/src/api/index.ts). */
  async getScenario(user: AuthContext, scenarioId: string): Promise<LabDetail> {
    const content = await this.answerKey(scenarioId, user.userId);

    const scenario = await this.prisma.playgroundGeneratedScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException("Scenario not found.");

    const attempt = await this.prisma.playgroundAttempt.findFirst({
      where: { userId: user.userId, scenarioId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, currentStep: true },
    });

    return {
      id: scenario.id,
      slug: scenario.id,
      title: content.lab.title,
      summary: content.lab.summary,
      businessContext: content.lab.businessContext,
      systemContext: content.lab.systemContext,
      difficulty: content.lab.difficulty,
      estimatedMinutes: content.lab.estimatedMinutes,
      version: 1,
      category: { id: "playground", name: "Playground", slug: "playground" },
      // Re-parse on the way out: it came from a language model, not a curator.
      dfd: extractFromDrawioXml(scenario.dfdXml),
      dfdVersion: 1,
      mitigationOptions: content.mitigations.map(({ id, title, description }) => ({ id, title, description })),
      attempt: attempt ?? null,
    };
  }

  /**
   * Server-only. Parses `content_json` back through the schema on every
   * read — the column is JSONB and a bad row must fail here, not inside a
   * grading loop. Ownership is optional: `PlaygroundAttemptsService` already
   * checked it via the attempt row before ever reaching a scenario id.
   */
  async answerKey(scenarioId: string, ownerUserId?: string): Promise<PlaygroundScenarioContent> {
    if (!isUuid(scenarioId)) throw new NotFoundException("Scenario not found.");
    const scenario = await this.prisma.playgroundGeneratedScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario || (ownerUserId && scenario.userId !== ownerUserId)) {
      throw new NotFoundException("Scenario not found.");
    }
    return playgroundScenarioContentSchema.parse(scenario.contentJson);
  }

  /** Owner-only. Re-validates that every threat/architecture-issue reference
   *  still resolves before accepting the edit — the same referential-integrity
   *  bar validateGeneratedScenario applies at generation time, re-applied here
   *  because the learner can now change the DFD after generation. */
  async updateScenarioDfd(user: AuthContext, scenarioId: string, drawioXml: string): Promise<void> {
    const scenario = await this.prisma.playgroundGeneratedScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario || scenario.userId !== user.userId) throw new NotFoundException("Scenario not found.");

    let graph;
    try {
      graph = extractFromDrawioXml(drawioXml);
    } catch {
      throw new BadRequestException("Couldn't read that diagram.");
    }

    const content = playgroundScenarioContentSchema.parse(scenario.contentJson);
    const errors = checkDfdReferences(graph, [
      ...content.architectureIssues.map((i) => ({
        label: `architecture issue "${i.title}"`,
        affectedNodeIds: i.affectedNodeIds,
        affectedEdgeIds: i.affectedEdgeIds,
      })),
      ...content.threats.map((t) => ({
        label: `threat "${t.title}"`,
        affectedNodeIds: t.affectedNodeIds,
        affectedEdgeIds: t.affectedEdgeIds,
      })),
    ]);
    if (errors.length) {
      throw new BadRequestException(`That edit removes something a threat or issue still points at: ${errors[0]}`);
    }

    // Prisma field is `dfdXml` on this model (LabDfd's is `drawioXml` — the two
    // models were named independently in Task 5; don't cross the names).
    await this.prisma.playgroundGeneratedScenario.update({ where: { id: scenarioId }, data: { dfdXml: drawioXml } });
  }

  private toJob(job: {
    id: string;
    status: string;
    errorMessage: string | null;
    scenario?: { id: string } | null;
  }): GenerationJob {
    return {
      jobId: job.id,
      status: job.status as GenerationJob["status"],
      scenarioId: job.scenario?.id ?? null,
      error: job.errorMessage,
    };
  }
}
