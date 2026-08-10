import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthContext } from "../guards/session.guard";

/** Resolved by SessionGuard. Never read straight from the request elsewhere. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest<{ auth: AuthContext }>().auth;
});
