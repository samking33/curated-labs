import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  type OrgRole,
  type PlatformRole,
} from "@curated-labs/shared";
import { CONFIG, type AppConfig } from "../../config";
import { PrismaService } from "../prisma/prisma.service";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  platformRoles: PlatformRole[];
  organizations: { id: string; slug: string; role: OrgRole }[];
  managedDepartmentIds: string[];
};

/**
 * Server-side sessions (§12). The raw token exists only in the cookie; the
 * database stores a SHA-256 of it, so a database leak cannot be replayed as a
 * login. Sessions carry both an idle timeout and an absolute lifetime.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Rotates on login (§12): a fresh token every time, never reusing the old. */
  async create(userId: string, meta: { ip?: string; userAgent?: string }) {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        csrfTokenHash: this.hash(csrfToken),
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        absoluteExpiry: new Date(Date.now() + SESSION_ABSOLUTE_MS),
      },
    });
    return { token, csrfToken };
  }

  /**
   * Resolves a cookie into the full authorization context in one query, so
   * every guarded route has real memberships rather than client-supplied ids.
   * Returns null for anything expired, revoked or disabled.
   */
  async resolve(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: {
        user: {
          include: {
            platformRoles: true,
            memberships: { where: { deletedAt: null }, include: { organization: true } },
            departmentMembers: { where: { isManager: true } },
          },
        },
      },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (session.absoluteExpiry.getTime() < now) return null;
    if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
    if (session.user.disabledAt) return null;

    // Sliding idle window. Only written once a minute — every request would
    // turn each read into a write for no security gain.
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      platformRoles: session.user.platformRoles.map((r) => r.role as PlatformRole),
      organizations: session.user.memberships
        .filter((m) => !m.organization.deletedAt)
        .map((m) => ({ id: m.organizationId, slug: m.organization.slug, role: m.role as OrgRole })),
      managedDepartmentIds: session.user.departmentMembers.map((d) => d.departmentId),
    };
  }

  /** Double-submit CSRF (§19): cookie value must match the request header. */
  async verifyCsrf(token: string | undefined, headerValue: string | undefined): Promise<boolean> {
    if (!token || !headerValue) return false;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      select: { csrfTokenHash: true },
    });
    if (!session) return false;
    const a = Buffer.from(session.csrfTokenHash);
    const b = Buffer.from(this.hash(headerValue));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "lax" as const,
      path: "/",
      maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
    };
  }
}
