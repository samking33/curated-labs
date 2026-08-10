import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { SessionGuard } from "./common/guards/session.guard";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { AiModule } from "./modules/ai/ai.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { AttemptsModule } from "./modules/attempts/attempts.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PointsModule } from "./modules/points/points.module";
import { HealthModule } from "./modules/health/health.module";
import { PlaygroundModule } from "./modules/playground/playground.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    AiModule,
    AssistantModule,
    CatalogModule,
    AttemptsModule,
    OrganizationsModule,
    PointsModule,
    PlaygroundModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    // Global and deny-by-default: a new route is protected unless it opts out
    // with @Public(), so forgetting the decorator fails closed (§13).
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
