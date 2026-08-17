import { Controller, Get, Inject } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config";
import { Public } from "../../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { NimClient } from "../ai/nim-client";

/** health checks. */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nim: NimClient,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready() {
    const db = await this.check(() => this.prisma.$queryRaw`SELECT 1`);
    // NIM being down degrades coaching but must not take the API out of
    // rotation: learners can still work and answers still persist.
    return { status: db.ok ? "ok" : "degraded", checks: { database: db } };
  }

  @Public()
  @Get("dependencies")
  async dependencies() {
    const [database, nim] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      this.config.nimConfigured
        ? this.check(() => this.nim.ping())
        : Promise.resolve({ ok: false, skipped: true, error: "NVIDIA_NIM_API_KEY not set" }),
    ]);
    return { database, nim, aiRequired: false };
  }

  private async check(fn: () => Promise<unknown>) {
    const started = Date.now();
    try {
      await fn();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 200) };
    }
  }
}
