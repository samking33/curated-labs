import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { CSRF_HEADER, type AccessContext } from "@curated-labs/shared";
import { IS_PUBLIC } from "../decorators/public.decorator";
import { SessionService, readSessionCookie, type SessionUser } from "../../modules/auth/session.service";

export type AuthContext = SessionUser & {
  /** Access context for the org named in the route, if any. */
  accessFor(organizationId: string | null | undefined): AccessContext;
  organizationId?: string | null;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global, deny-by-default authentication. A route is protected unless it
 * carries @Public(), so a new endpoint added without thinking is closed rather
 * than open. Also enforces CSRF on cookie-authenticated mutations.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<
      FastifyRequest & { auth?: AuthContext; cookies?: Record<string, string> }
    >();
    const token = readSessionCookie(request);

    if (isPublic) {
      // Still resolve when a cookie is present: /labs shows attempt state for
      // signed-in users and stays usable for anonymous ones.
      const user = await this.sessions.resolve(token);
      if (user) request.auth = withAccess(user);
      return true;
    }

    const user = await this.sessions.resolve(token);
    if (!user) throw new UnauthorizedException("Sign in to continue.");

    if (!SAFE_METHODS.has(request.method)) {
      const header = request.headers[CSRF_HEADER];
      const ok = await this.sessions.verifyCsrf(token, Array.isArray(header) ? header[0] : header);
      if (!ok) throw new ForbiddenException("Invalid CSRF token.");
    }

    request.auth = withAccess(user);
    return true;
  }
}

/**
 * Binds the user's real memberships to an org id. Callers pass the org from the
 * route; membership is looked up here, so a forged organizationId resolves to
 * "no role" instead of granting access.
 */
export function withAccess(user: SessionUser): AuthContext {
  return {
    ...user,
    accessFor(organizationId) {
      const membership = organizationId
        ? user.organizations.find((o) => o.id === organizationId)
        : undefined;
      return {
        platformRoles: user.platformRoles,
        orgRole: membership?.role ?? null,
        managedDepartmentIds: user.managedDepartmentIds,
      };
    },
  };
}
