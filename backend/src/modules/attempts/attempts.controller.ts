import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  architectureIssuesSubmissionSchema,
  attackSurfacesSubmissionSchema,
  mitigationsSubmissionSchema,
  prioritizationSubmissionSchema,
  releaseDecisionSubmissionSchema,
  threatsSubmissionSchema,
} from "@curated-labs/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AttemptsService } from "./attempts.service";

/**
 * Step submissions accept an Idempotency-Key so a retried POST after a network
 * blip returns the original result instead of re-running the AI call.
 */
@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post("labs/:labId/attempts")
  start(@CurrentUser() user: AuthContext, @Param("labId") labId: string) {
    return this.attempts.start(user, labId);
  }

  @Get("attempts/:attemptId")
  get(@CurrentUser() user: AuthContext, @Param("attemptId") attemptId: string) {
    return this.attempts.get(user, attemptId);
  }

  @Get("attempts/:attemptId/progress")
  async progress(@CurrentUser() user: AuthContext, @Param("attemptId") attemptId: string) {
    const attempt = await this.attempts.get(user, attemptId);
    return {
      currentStep: attempt.currentStep,
      status: attempt.status,
      submittedSteps: [...new Set(attempt.submissions.map((s) => s.step))],
    };
  }

  @Post("attempts/:attemptId/steps/architecture-issues")
  architectureIssues(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(architectureIssuesSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitArchitectureIssues(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitArchitectureIssues"]>[2],
      { idempotencyKey: key },
    );
  }

  @Post("attempts/:attemptId/steps/attack-surfaces")
  attackSurfaces(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(attackSurfacesSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitAttackSurfaces(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitAttackSurfaces"]>[2],
      { idempotencyKey: key },
    );
  }

  @Post("attempts/:attemptId/steps/threats")
  threats(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(threatsSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitThreats(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitThreats"]>[2],
      { idempotencyKey: key },
    );
  }

  @Post("attempts/:attemptId/steps/prioritization")
  prioritization(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(prioritizationSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitPrioritization(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitPrioritization"]>[2],
      { idempotencyKey: key },
    );
  }

  @Post("attempts/:attemptId/steps/mitigations")
  mitigations(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(mitigationsSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitMitigations(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitMitigations"]>[2],
      { idempotencyKey: key },
    );
  }

  @Post("attempts/:attemptId/steps/release-decision")
  releaseDecision(
    @CurrentUser() user: AuthContext,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(releaseDecisionSubmissionSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.attempts.submitReleaseDecision(
      user,
      attemptId,
      body as Parameters<AttemptsService["submitReleaseDecision"]>[2],
      { idempotencyKey: key },
    );
  }

  @Get("me/progress")
  myProgress(@CurrentUser() user: AuthContext) {
    return this.attempts.progressForUser(user.userId);
  }
}
