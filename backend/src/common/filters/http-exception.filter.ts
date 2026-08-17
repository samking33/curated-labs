import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ErrorCode } from "@curated-labs/shared";

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "AI_UNAVAILABLE",
};

/**
 * One error envelope for every failure, always carrying the request id.
 * Stack traces and raw messages never cross the boundary in production: an
 * unexpected throw becomes a generic INTERNAL so we cannot leak query text or
 * file paths to a caller.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = (request as { requestId?: string }).requestId ?? "unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = "INTERNAL";
    let message = "Something went wrong.";
    let details: unknown;

    // Fastify rejects a malformed request before Nest sees it (an empty body
    // with a JSON content-type, a payload over the size cap) and raises a
    // plain Error carrying its own statusCode. Without this it falls through
    // to the catch-all below and a client mistake is reported as a server
    // fault, which is both wrong and noisy in the logs.
    const fastifyStatus = (exception as { statusCode?: unknown })?.statusCode;
    if (typeof fastifyStatus === "number" && fastifyStatus >= 400 && fastifyStatus < 500) {
      status = fastifyStatus;
      code = STATUS_TO_CODE[fastifyStatus] ?? "BAD_REQUEST";
      message = "Malformed request.";
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = "BAD_REQUEST";
      message = "Request validation failed.";
      details = exception.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? "INTERNAL";
      const body = exception.getResponse();
      if (typeof body === "string") message = body;
      else if (body && typeof body === "object" && "message" in body) {
        const m = (body as { message: unknown }).message;
        message = Array.isArray(m) ? m.join(", ") : String(m);
      }
    }

    if (status >= 500) {
      this.logger.error({ requestId, err: exception }, "unhandled error");
      if (this.isProduction) {
        message = "Something went wrong.";
        details = undefined;
      } else if (exception instanceof Error) {
        message = exception.message;
      }
    }

    void reply.status(status).send({ error: { code, message, requestId, ...(details ? { details } : {}) } });

    if (isUnrecoverableEnginePanic(exception)) this.recycle();
  }

  /**
   * A Prisma engine panic is not recoverable: the client stays broken for the
   * life of the process, so every later query fails too. Exit and let the
   * supervisor start a fresh engine, once the response above has flushed.
   */
  private recycle() {
    this.logger.error("prisma engine panicked and cannot recover — exiting so the supervisor restarts a fresh one");
    setTimeout(() => process.exit(1), 100).unref();
  }
}

function isUnrecoverableEnginePanic(exception: unknown): boolean {
  const message = exception instanceof Error ? exception.message : "";
  return message.includes("PANIC:") || message.includes("non-recoverable error");
}
