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
import { readSessionCookie } from "./modules/auth/session.service";

/**
 * Which peers may set X-Forwarded-For, read before the app exists because the
 * adapter is built first.
 *
 * Naming the addresses rather than counting hops is the part that matters: a
 * hop count still trusts whoever opened the socket, so anyone able to reach
 * this port directly could present a new address on every request and defeat
 * address-based rate limiting. The default is loopback, which is the frontend
 * rewrite proxy on the same host. Set TRUSTED_PROXY when it lives elsewhere.
 */
const TRUSTED_PROXY = process.env.TRUSTED_PROXY ?? "loopback";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    /**
     * 1 MB cap: the largest legitimate body is a free-text answer.
     *
     * trustProxy names the peers allowed to set X-Forwarded-For rather than
     * saying `true`, which would take that header from anyone.
     */
    new FastifyAdapter({ bodyLimit: 1_048_576, trustProxy: TRUSTED_PROXY }),
  );

  const config = app.get<AppConfig>(CONFIG);

  await app.register(helmet, {
    // The API serves JSON only; a CSP here would only affect error pages.
    contentSecurityPolicy: false,
    hsts: config.isHardened ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });

  /**
   * A signed session gets its own bucket, because behind the frontend's
   * reverse proxy every request would otherwise share one address. Anything
   * without a valid signature falls back to the address, and the signature is
   * what makes that safe: an unsigned cookie can be invented per request, and
   * each invented value would open a fresh bucket.
   */
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => readSessionCookie(req as never) ?? req.ip,
  });

  // Strict allowlist: never reflect an arbitrary Origin with credentials.
  app.enableCors({
    origin: [config.WEB_APP_URL],
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key", "x-request-id"],
  });

  app.setGlobalPrefix(API_PREFIX);
  // Validation is per-route via ZodValidationPipe against the shared contracts,
  // so there is no class-validator global pipe here.
  app.useGlobalFilters(new HttpExceptionFilter(config.isHardened));
  app.enableShutdownHooks();

  await app.listen(config.PORT, process.env.BIND_HOST ?? "0.0.0.0");

  const logger = new Logger("bootstrap");
  logger.log(`API listening on ${config.API_BASE_URL}${API_PREFIX}`);
  if (!config.googleConfigured) logger.warn("Google OIDC is not configured — sign-in is unavailable.");
  if (config.aiApiKey) logger.log(`AI provider: ${config.aiProvider} (${config.aiModels.fast} / ${config.aiModels.reasoning})`);
  else logger.warn("No AI provider is configured, so coaching will be unavailable.");
  if (!config.anthropicConfigured && config.aiProvider !== "openai")
    logger.warn("No author model is configured, so Playground scenario generation will be unavailable.");
  if (config.ALLOW_DEV_LOGIN) logger.warn("ALLOW_DEV_LOGIN is on. Development only.");
}

void bootstrap();
