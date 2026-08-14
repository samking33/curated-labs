import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: "event", level: "warn" }, { emit: "event", level: "error" }] });
  }

  /**
   * Connecting here is a warm-up, not a requirement — Prisma opens the
   * connection lazily on the first query either way. So a database that is
   * briefly unreachable at boot (a cold Neon compute, a pooler blip) must
   * not take the whole process down: it would crash-loop until the database
   * happened to answer, with every page down meanwhile, including the ones
   * that never touch it. Log it and let the first real query retry.
   *
   * /health/ready still reports the truth, since it runs an actual query.
   */
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error({ err: (err as Error).message }, "initial database connect failed — will retry on first query");
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
