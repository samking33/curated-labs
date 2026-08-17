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
import { PlaygroundAttemptsService } from "./playground-attempts.service";

/** Separate URL namespace from the curated /attempts routes, not an overload
 *  of :attemptId — overloading would mean probing two tables on every submit
 *  and an ambiguous 404, to save one prop on the frontend. */
@Controller("playground")
export class PlaygroundAttemptsController {
  constructor(private readonly attempts: PlaygroundAttemptsService) {}

  @Post("scenarios/:scenarioId/attempts")
  start(@CurrentUser() user: AuthContext, @Param("scenarioId") scenarioId: string) {
    return this.attempts.start(user, scenarioId);
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
      body as Parameters<PlaygroundAttemptsService["submitArchitectureIssues"]>[2],
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
      body as Parameters<PlaygroundAttemptsService["submitAttackSurfaces"]>[2],
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
      body as Parameters<PlaygroundAttemptsService["submitThreats"]>[2],
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
      body as Parameters<PlaygroundAttemptsService["submitPrioritization"]>[2],
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
      body as Parameters<PlaygroundAttemptsService["submitMitigations"]>[2],
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
      body as Parameters<PlaygroundAttemptsService["submitReleaseDecision"]>[2],
      { idempotencyKey: key },
    );
  }
}
