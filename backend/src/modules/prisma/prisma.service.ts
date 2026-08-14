import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * No $connect() at boot, deliberately.
 *
 * Prisma opens the connection lazily on the first query, so connecting in
 * onModuleInit only moves that work earlier — into the busiest moment of
 * startup. On the constrained shared host this deploys to, that is where
 * Prisma's native query engine kept panicking with "PANIC: timer has gone
 * away" (its tokio timer thread missing a deadline while the process is CPU
 * throttled). The panic arrives as an unhandled rejection from inside the
 * Rust engine, so it cannot be caught here — the process just dies, and it
 * died on every boot, which is what put the whole site on 503.
 *
 * Connecting lazily takes that work out of the startup burst: the API comes
 * up, /health/live answers immediately (it runs no query), and the first
 * real query opens the connection once the process is no longer competing
 * with Next's own startup. /health/ready still reports the truth, because
 * it issues an actual query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ log: [{ emit: "event", level: "warn" }, { emit: "event", level: "error" }] });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
