import { Injectable, Logger } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../prisma/prisma.service";

export type AuditEvent = {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
};

/**
 * Append-only trail for the sensitive actions in §17. Kept separate from the
 * records it describes so editing an org cannot rewrite its own history.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: event.actorUserId ?? null,
          organizationId: event.organizationId ?? null,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId ?? null,
          ipAddress: event.request?.ip ?? null,
          userAgent: event.request?.headers["user-agent"]?.slice(0, 512) ?? null,
          metadataJson: (event.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      // Never fail the user's action because the audit write failed, but make
      // the gap loud — a silently missing trail is worse than a noisy log.
      this.logger.error({ err, action: event.action }, "audit write failed");
    }
  }
}
