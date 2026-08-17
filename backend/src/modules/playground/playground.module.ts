import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PlaygroundGenerationService } from "./playground-generation.service";
import { PlaygroundAttemptsService } from "./playground-attempts.service";
import { PlaygroundController } from "./playground.controller";
import { PlaygroundAttemptsController } from "./playground-attempts.controller";

// Prisma and Audit are @Global(): only AiModule needs an explicit import here.
@Module({
  imports: [AiModule],
  controllers: [PlaygroundController, PlaygroundAttemptsController],
  providers: [PlaygroundGenerationService, PlaygroundAttemptsService],
})
export class PlaygroundModule {}
