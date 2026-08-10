import { SetMetadata } from "@nestjs/common";

/**
 * Marks a route as unauthenticated. Auth is deny-by-default via a global
 * SessionGuard, so forgetting this decorator fails closed.
 */
export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);
