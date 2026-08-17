/**
 * The permission matrix from PROJECT.md, as executable data.
 *
 * This is the single source of truth for both sides: the API enforces it, the
 * web app uses it to decide what to render. It is data rather than scattered
 * `if` statements so the table in the spec can be diffed against the code.
 *
 * Rendering rules are a convenience, never a control. Every decision here is
 * re-made server-side against the caller's real memberships.
 */

export const PLATFORM_ROLES = ["platform_owner", "platform_content_manager"] as const;
export const ORG_ROLES = ["org_owner", "org_admin", "department_manager", "learner"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type OrgRole = (typeof ORG_ROLES)[number];
export type Role = PlatformRole | OrgRole;

export const PERMISSIONS = [
  "platform:manage_settings",
  "lab:write",
  "org:view_all",
  "org:create",
  "org:manage",
  "department:manage",
  "invitation:write",
  "department:assign_users",
  "progress:view_org",
  "lab:start",
  "lab:submit",
  "ai:admin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * "limited" in the spec's table means: allowed, but only inside departments
 * where the user holds manager scope. The permission is granted here and the
 * department filter is applied by the caller: see `managedDepartmentIds`.
 */
export type Grant = "yes" | "limited";

const MATRIX: Record<Role, Partial<Record<Permission, Grant>>> = {
  platform_owner: {
    "platform:manage_settings": "yes",
    "lab:write": "yes",
    "org:view_all": "yes",
    "org:create": "yes",
    "org:manage": "yes",
    "department:manage": "yes",
    "invitation:write": "yes",
    "department:assign_users": "yes",
    "progress:view_org": "yes",
    "lab:start": "yes",
    "lab:submit": "yes",
    "ai:admin": "yes",
  },
  platform_content_manager: {
    "lab:write": "yes",
    "lab:start": "yes",
    "lab:submit": "yes",
  },
  org_owner: {
    "org:create": "yes",
    "org:manage": "yes",
    "department:manage": "yes",
    "invitation:write": "yes",
    "department:assign_users": "yes",
    "progress:view_org": "yes",
    "lab:start": "yes",
    "lab:submit": "yes",
  },
  org_admin: {
    "org:manage": "yes",
    "department:manage": "yes",
    "invitation:write": "yes",
    "department:assign_users": "yes",
    "progress:view_org": "yes",
    "lab:start": "yes",
    "lab:submit": "yes",
  },
  department_manager: {
    "department:manage": "limited",
    "invitation:write": "limited",
    "department:assign_users": "limited",
    "progress:view_org": "limited",
    "lab:start": "yes",
    "lab:submit": "yes",
  },
  learner: {
    "lab:start": "yes",
    "lab:submit": "yes",
  },
};

/** Everything the guard needs to decide, resolved from the session. */
export type AccessContext = {
  platformRoles: PlatformRole[];
  /** Role held in the organization being acted on, if any. */
  orgRole?: OrgRole | null;
  /** Departments where this user has manager scope, within that organization. */
  managedDepartmentIds?: string[];
};

function grantFor(ctx: AccessContext, permission: Permission): Grant | null {
  for (const role of ctx.platformRoles) {
    const g = MATRIX[role][permission];
    if (g === "yes") return "yes";
  }
  const orgGrant = ctx.orgRole ? MATRIX[ctx.orgRole][permission] : undefined;
  // A platform "limited" never appears, so org scope decides the rest.
  return orgGrant ?? null;
}

/** True when the permission is held at all, ignoring department narrowing. */
export function can(ctx: AccessContext, permission: Permission): boolean {
  return grantFor(ctx, permission) !== null;
}

/**
 * Department-scoped check. A `limited` grant only applies inside departments
 * the user manages, so a department manager cannot reach a sibling department.
 * Passing no department while holding only a limited grant is denied: the spec
 * gives department managers no organization-wide view.
 */
export function canInDepartment(
  ctx: AccessContext,
  permission: Permission,
  departmentId: string | null | undefined,
): boolean {
  const grant = grantFor(ctx, permission);
  if (grant === null) return false;
  if (grant === "yes") return true;
  if (!departmentId) return false;
  return (ctx.managedDepartmentIds ?? []).includes(departmentId);
}

/** Learners may read only their own attempts; org staff may read their org's. */
export function canViewAttempt(
  ctx: AccessContext,
  attempt: { userId: string; organizationId?: string | null; departmentId?: string | null },
  viewerUserId: string,
): boolean {
  if (attempt.userId === viewerUserId) return true;
  if (ctx.platformRoles.includes("platform_owner")) return true;
  if (!attempt.organizationId) return false;
  return canInDepartment(ctx, "progress:view_org", attempt.departmentId);
}
