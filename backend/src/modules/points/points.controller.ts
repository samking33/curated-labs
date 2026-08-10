import { Controller, ForbiddenException, Get, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { PointsService } from "./points.service";

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

@Controller()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get("leaderboard")
  global(@CurrentUser() user: AuthContext, @Query("limit") limit?: string) {
    return this.points.leaderboard({ scope: "global", viewerUserId: user.userId, limit: clampLimit(limit) });
  }

  /**
   * Open to any member, not just admins — a peer leaderboard is motivational,
   * a different concern from the org-oversight routes that gate on
   * `progress:view_org`. Still requires membership: an org's ranking is not
   * meant to be readable by outsiders even though the global board is.
   */
  @Get("organizations/:organizationId/leaderboard")
  organization(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") organizationId: string,
    @Query("limit") limit?: string,
  ) {
    const ctx = user.accessFor(organizationId);
    if (!ctx.orgRole && !ctx.platformRoles.includes("platform_owner")) {
      throw new ForbiddenException("You are not a member of this organization.");
    }
    return this.points.leaderboard({
      scope: "organization",
      organizationId,
      viewerUserId: user.userId,
      limit: clampLimit(limit),
    });
  }

  @Get("me/points")
  async mine(@CurrentUser() user: AuthContext) {
    const [total, recent] = await Promise.all([
      this.points.totalForUser(user.userId),
      this.points.recentForUser(user.userId),
    ]);
    return { total, recent };
  }
}
