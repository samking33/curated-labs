import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { tap } from "rxjs/operators";
import type { Observable } from "rxjs";

/**
 * Assigns a request id and emits the structured access log:
 * request id, user, org, route, status, duration. Never logs bodies: answers
 * and tokens both live there.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger("http");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest & { requestId?: string; auth?: { userId: string; organizationId?: string | null } }>();
    const reply = http.getResponse<FastifyReply>();

    const incoming = request.headers["x-request-id"];
    request.requestId = (typeof incoming === "string" && incoming.slice(0, 64)) || `req_${randomUUID()}`;
    void reply.header("x-request-id", request.requestId);

    const started = process.hrtime.bigint();
    const finish = (status: number) => {
      this.logger.log({
        requestId: request.requestId,
        userId: request.auth?.userId ?? null,
        organizationId: request.auth?.organizationId ?? null,
        method: request.method,
        route: request.url.split("?")[0],
        status,
        durationMs: Number(process.hrtime.bigint() - started) / 1e6,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finish(reply.statusCode),
        error: (err: unknown) => finish((err as { status?: number }).status ?? 500),
      }),
    );
  }
}
