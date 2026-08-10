import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { generateScenarioRequestSchema } from "@curated-labs/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PlaygroundGenerationService } from "./playground-generation.service";

const createSessionSchema = z.object({ title: z.string().min(1).max(200) });

// No @Public() anywhere — SessionGuard (APP_GUARD) closes every route here
// and enforces CSRF on the mutations, with zero extra wiring.
@Controller("playground")
export class PlaygroundController {
  constructor(private readonly generation: PlaygroundGenerationService) {}

  @Post("sessions")
  createSession(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createSessionSchema)) body: { title: string },
  ) {
    return this.generation.createSession(user, body.title);
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: AuthContext) {
    return this.generation.listSessions(user);
  }

  @Post("sessions/:sessionId/scenarios")
  generate(
    @CurrentUser() user: AuthContext,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(generateScenarioRequestSchema)) body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.generation.requestGeneration(
      user,
      sessionId,
      body as Parameters<PlaygroundGenerationService["requestGeneration"]>[2],
      { idempotencyKey: key },
    );
  }

  @Get("jobs/:jobId")
  job(@CurrentUser() user: AuthContext, @Param("jobId") jobId: string) {
    return this.generation.jobStatus(user, jobId);
  }

  @Get("scenarios")
  listScenarios(@CurrentUser() user: AuthContext) {
    return this.generation.listScenarios(user);
  }

  @Get("scenarios/:scenarioId")
  scenario(@CurrentUser() user: AuthContext, @Param("scenarioId") scenarioId: string) {
    return this.generation.getScenario(user, scenarioId);
  }
}
