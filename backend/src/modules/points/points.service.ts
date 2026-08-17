import { Injectable } from "@nestjs/common";
import { Prisma, type PointReason as PrismaPointReason } from "@prisma/client";
import { cheerFor, type LeaderboardEntry, type LeaderboardResponse, type PointReason } from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";

export type PointCandidate = { reason: PointReason; refId: string; amount: number };

type LeaderboardRow = { userId: string; name: string; avatarUrl: string | null; points: number; rank: bigint };
type SelfRow = { points: number; rank: bigint };

/**
 * The points ledger (added at the user's direction on top of the original
 * spec — see PointEvent's schema comment for why it's a ledger, not a counter).
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Awards whichever candidates aren't already recorded for this attempt.
   *
   * The DB's unique constraint on (attemptId, reason, refId) is the actual
   * guarantee against double-awarding — this pre-filter just avoids a wasted
   * round trip and lets the caller report accurate "what's new" cheer text.
   * Racing duplicate requests still can't double-award: skipDuplicates makes
   * the insert a no-op for whichever one loses the race.
   */
  async awardMany(
    ctx: { userId: string; organizationId: string | null; attemptId: string },
    candidates: PointCandidate[],
  ): Promise<PointCandidate[]> {
    if (candidates.length === 0) return [];

    const reasons = [...new Set(candidates.map((c) => c.reason))] as PrismaPointReason[];
    const existing = await this.prisma.pointEvent.findMany({
      where: { attemptId: ctx.attemptId, reason: { in: reasons } },
      select: { reason: true, refId: true },
    });
    const already = new Set(existing.map((e) => `${e.reason}:${e.refId}`));
    const fresh = candidates.filter((c) => !already.has(`${c.reason}:${c.refId}`));
    if (fresh.length === 0) return [];

    await this.prisma.pointEvent.createMany({
      data: fresh.map((c) => ({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        attemptId: ctx.attemptId,
        reason: c.reason as PrismaPointReason,
        refId: c.refId,
        amount: c.amount,
      })),
      skipDuplicates: true,
    });

    return fresh;
  }

  /** Cheer lines for a batch of freshly-awarded candidates, capped so one big
   *  correct step doesn't wall the learner in toasts. */
  cheersFor(awarded: PointCandidate[], cap = 3): string[] {
    const counts = new Map<string, number>();
    const cheers: string[] = [];
    for (const a of awarded) {
      if (cheers.length >= cap) break;
      if (a.reason === "architecture_submitted" || a.reason === "release_submitted") continue;
      const n = counts.get(a.reason) ?? 0;
      counts.set(a.reason, n + 1);
      cheers.push(cheerFor(a.reason, n));
    }
    return cheers;
  }

  async totalForUser(userId: string): Promise<number> {
    const r = await this.prisma.pointEvent.aggregate({ where: { userId }, _sum: { amount: true } });
    return r._sum.amount ?? 0;
  }

  async recentForUser(userId: string, limit = 10) {
    const events = await this.prisma.pointEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { attempt: { include: { lab: { select: { title: true } } } } },
    });
    return events.map((e) => ({
      reason: e.reason,
      amount: e.amount,
      labTitle: e.attempt.lab.title,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /**
   * Top N plus the caller's own row, even when they fall outside it. Both
   * queries are raw because Prisma's query builder has no native support for
   * a ranked group-by — the two SQL statements below are read-only and every
   * value is passed through Prisma.sql's tagging, never string-concatenated,
   * so there's no injection surface despite the raw SQL.
   */
  async leaderboard(opts: {
    scope: "global" | "organization";
    organizationId?: string;
    viewerUserId: string;
    limit?: number;
  }): Promise<LeaderboardResponse> {
    const limit = Math.min(opts.limit ?? 20, 100);
    // Explicit ::uuid casts throughout: Prisma's node-postgres driver sends
    // tagged-template parameters as text, and Postgres has no implicit
    // uuid = text operator — every comparison against a uuid column 500s
    // with "operator does not exist" unless the parameter is cast.
    const orgFilter =
      opts.scope === "organization" && opts.organizationId
        ? Prisma.sql`WHERE pe.organization_id = ${opts.organizationId}::uuid AND u.disabled_at IS NULL AND u.leaderboard_opt_out = false`
        : Prisma.sql`WHERE u.disabled_at IS NULL AND u.leaderboard_opt_out = false`;

    const rows = await this.prisma.$queryRaw<LeaderboardRow[]>`
      SELECT u.id AS "userId", u.name, u.avatar_url AS "avatarUrl",
             SUM(pe.amount)::int AS points,
             RANK() OVER (ORDER BY SUM(pe.amount) DESC) AS rank
      FROM point_events pe
      JOIN users u ON u.id = pe.user_id
      ${orgFilter}
      GROUP BY u.id, u.name, u.avatar_url
      ORDER BY points DESC
      LIMIT ${limit}
    `;

    const entries: LeaderboardEntry[] = rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      avatarUrl: r.avatarUrl,
      points: r.points,
      rank: Number(r.rank),
      isSelf: r.userId === opts.viewerUserId,
    }));

    /*
     * Opting out removes the learner from everyone else's view, not from
     * their own. The listing above already excludes them, so the self lookup
     * below runs unconditionally and their rank is still computed against the
     * full field — hiding your name should not also cost you your progress.
     */
    let self = entries.find((e) => e.isSelf) ?? null;
    if (!self) {
      const selfOrgFilter =
        opts.scope === "organization" && opts.organizationId
          ? Prisma.sql`WHERE organization_id = ${opts.organizationId}::uuid`
          : Prisma.sql``;
      const selfRows = await this.prisma.$queryRaw<SelfRow[]>`
        WITH totals AS (
          SELECT user_id, SUM(amount)::int AS points
          FROM point_events
          ${selfOrgFilter}
          GROUP BY user_id
        )
        SELECT points, RANK() OVER (ORDER BY points DESC) AS rank
        FROM totals
        WHERE user_id = ${opts.viewerUserId}::uuid
      `;
      if (selfRows[0]) {
        const record = await this.prisma.user.findUnique({
          where: { id: opts.viewerUserId },
          select: { name: true, avatarUrl: true },
        });
        self = {
          userId: opts.viewerUserId,
          name: record?.name ?? "You",
          avatarUrl: record?.avatarUrl ?? null,
          points: selfRows[0].points,
          rank: Number(selfRows[0].rank),
          isSelf: true,
        };
      }
    }

    return { scope: opts.scope, entries, self };
  }
}
