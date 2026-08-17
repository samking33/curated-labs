import { Body, Controller, Get, Inject, NotFoundException, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  updatePreferencesRequestSchema,
  type MeResponse,
  type UpdatePreferencesRequest,
} from "@curated-labs/shared";
import { CONFIG, type AppConfig } from "../../config";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import { AuditService } from "../audit/audit.service";

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).default("Dev User"),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get("google")
  async google(@Query("returnTo") returnTo: string | undefined, @Res() reply: FastifyReply) {
    const url = await this.auth.startLogin(this.auth.safeReturnTo(returnTo));
    return reply.redirect(url, 302);
  }

  @Public()
  @Get("google/callback")
  async googleCallback(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const params = request.query as Record<string, string | undefined>;

    // Google reports consent denial as a query param, not an error status.
    if (params.error) {
      return reply.redirect(`${this.config.WEB_APP_URL}/login?error=${encodeURIComponent(params.error)}`, 302);
    }

    const { user, returnTo } = await this.auth.completeLogin(params);
    await this.issueSession(user.id, request, reply);
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      request,
    });
    return reply.redirect(`${this.config.WEB_APP_URL}${returnTo}`, 302);
  }

  /** Dev-only. Absent from the route table unless ALLOW_DEV_LOGIN is set. */
  @Public()
  @Post("dev-login")
  async devLogin(
    @Body(new ZodValidationPipe(devLoginSchema)) body: z.infer<typeof devLoginSchema>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!this.config.ALLOW_DEV_LOGIN) throw new NotFoundException();
    const user = await this.auth.devLogin(body.email, body.name);
    await this.issueSession(user.id, request, reply);
    return reply.send({ ok: true, userId: user.id });
  }

  @Post("logout")
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply, @CurrentUser() user: AuthContext) {
    const cookies = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies;
    await this.sessions.revoke(cookies?.[SESSION_COOKIE]);
    await this.audit.record({
      actorUserId: user.userId,
      action: "auth.logout",
      targetType: "user",
      targetId: user.userId,
      request,
    });
    const opts = { ...this.sessions.cookieOptions(), maxAge: 0 };
    return reply.clearCookie(SESSION_COOKIE, opts).clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false }).send({ ok: true });
  }

  @Get("me")
  async me(@CurrentUser() user: AuthContext): Promise<MeResponse> {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      include: { memberships: { where: { deletedAt: null }, include: { organization: true } } },
    });
    return {
      user: {
        id: record.id,
        email: record.email,
        name: record.name,
        avatarUrl: record.avatarUrl,
      },
      platformRoles: user.platformRoles,
      organizations: record.memberships
        .filter((m) => !m.organization.deletedAt)
        .map((m) => ({
          id: m.organizationId,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
        })),
      accountKind: record.accountKind,
      leaderboardOptOut: record.leaderboardOptOut,
    };
  }

  /**
   * Learner-controlled preferences. Only ever writes the caller's own row —
   * there is no user id in the path, so one learner cannot change another's.
   */
  @Patch("me/preferences")
  async updatePreferences(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(updatePreferencesRequestSchema)) body: UpdatePreferencesRequest,
  ) {
    await this.prisma.user.update({
      where: { id: user.userId },
      data: { leaderboardOptOut: body.leaderboardOptOut },
    });
    return { ok: true, leaderboardOptOut: body.leaderboardOptOut };
  }

  /**
   * Sets both cookies. The CSRF cookie is deliberately readable by JavaScript —
   * the browser must echo it in a header for the double-submit check, which is
   * what an attacker on another origin cannot do.
   */
  private async issueSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const { token, csrfToken } = await this.sessions.create(userId, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    const opts = this.sessions.cookieOptions();
    void reply.setCookie(SESSION_COOKIE, token, opts);
    void reply.setCookie(CSRF_COOKIE, csrfToken, { ...opts, httpOnly: false });
  }
}
