import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { API_PREFIX } from "@curated-labs/shared";
import { AppModule } from "./app.module";
import { CONFIG, type AppConfig } from "./config";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // 1 MB cap: the largest legitimate body is a free-text answer (§19).
    new FastifyAdapter({ bodyLimit: 1_048_576, trustProxy: true }),
  );

  const config = app.get<AppConfig>(CONFIG);

  await app.register(helmet, {
    // The API serves JSON only; a CSP here would only affect error pages.
    contentSecurityPolicy: false,
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });

  // Rate limits on everything, with auth and AI tightened in their controllers.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Session cookie beats IP: shared NAT should not throttle a whole office.
    keyGenerator: (req) => (req as { cookies?: Record<string, string> }).cookies?.cl_session ?? req.ip,
  });

  // Strict allowlist (§19) — never reflect an arbitrary Origin with credentials.
  app.enableCors({
    origin: [config.WEB_APP_URL],
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key", "x-request-id"],
  });

  app.setGlobalPrefix(API_PREFIX);
  // Validation is per-route via ZodValidationPipe against the shared contracts,
  // so there is no class-validator global pipe here.
  app.useGlobalFilters(new HttpExceptionFilter(config.isProduction));
  app.enableShutdownHooks();

  await app.listen(config.PORT, "0.0.0.0");

  const logger = new Logger("bootstrap");
  logger.log(`API listening on ${config.API_BASE_URL}${API_PREFIX}`);
  if (!config.googleConfigured) logger.warn("Google OIDC is not configured — sign-in is unavailable.");
  if (!config.nimConfigured) logger.warn("NVIDIA NIM is not configured — AI coaching will be unavailable.");
  if (config.ALLOW_DEV_LOGIN) logger.warn("ALLOW_DEV_LOGIN is on. Development only.");
}

void bootstrap();
