import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PointsModule } from "../points/points.module";
import { AttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";

@Module({
  imports: [AiModule, PointsModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
  exports: [AttemptsService],
})
export class AttemptsModule {}
