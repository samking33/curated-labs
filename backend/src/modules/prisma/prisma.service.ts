import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma sizes its connection pool from the CPU count: `num_cpus * 2 + 1`.
 * That is a sane default on a dedicated box and a disaster on a big shared
 * one: the production host reports 64 CPUs, so the default pool is 129
 * connections, and the engine's thread pool scales with the same number.
 * Measured on that host, one backend process held 74 of the account's ~114
 * available tasks, which is what starved the engine's timer thread ("PANIC:
 * timer has gone away") and left the account unable to fork at all (`spawn
 * EAGAIN`). Capping it took the same process to 12 threads.
 *
 * Five is ample here: every query is short, and the deployment already
 * points at Neon's connection pooler, which is the thing actually meant to
 * be multiplexing connections. An explicit connection_limit already in the
 * URL wins, so this stays overridable from configuration.
 */
const DEFAULT_CONNECTION_LIMIT = 5;

export function withConnectionLimit(url: string, limit = DEFAULT_CONNECTION_LIMIT): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
}

/**
 * No $connect() at boot, deliberately.
 *
 * Prisma opens the connection lazily on the first query, so connecting in
 * onModuleInit only moves that work into the busiest moment of startup:
 * exactly when this host is most likely to throttle, and where the engine
 * kept dying. /health/live runs no query and answers immediately, so the
 * API reports itself up; /health/ready still tells the truth because it
 * issues a real query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    super({
      log: [{ emit: "event", level: "warn" }, { emit: "event", level: "error" }],
      // Left to the schema's own env("DATABASE_URL") when unset, so a
      // missing URL still fails with Prisma's own clear error.
      ...(url ? { datasources: { db: { url: withConnectionLimit(url) } } } : {}),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
