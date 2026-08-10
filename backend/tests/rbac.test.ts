import { describe, expect, it } from "vitest";
import {
  can,
  canInDepartment,
  canViewAttempt,
  type AccessContext,
} from "@curated-labs/shared";

/**
 * The §6 permission table, asserted row by row. These are the checks that stop
 * one organization reading another's data, so they get exhaustive coverage.
 */

const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({
  platformRoles: [],
  orgRole: null,
  managedDepartmentIds: [],
  ...over,
});

describe("platform roles", () => {
  it("gives the platform owner every permission", () => {
    const owner = ctx({ platformRoles: ["platform_owner"] });
    for (const p of ["platform:manage_settings", "lab:write", "org:view_all", "ai:admin"] as const) {
      expect(can(owner, p)).toBe(true);
    }
  });

  it("lets a content manager write labs but not manage organizations", () => {
    const cm = ctx({ platformRoles: ["platform_content_manager"] });
    expect(can(cm, "lab:write")).toBe(true);
    expect(can(cm, "org:manage")).toBe(false);
    expect(can(cm, "platform:manage_settings")).toBe(false);
  });
});

describe("organization roles", () => {
  it("denies a learner every administrative permission", () => {
    const learner = ctx({ orgRole: "learner" });
    for (const p of ["org:manage", "invitation:write", "department:manage", "progress:view_org"] as const) {
      expect(can(learner, p)).toBe(false);
    }
    expect(can(learner, "lab:start")).toBe(true);
    expect(can(learner, "lab:submit")).toBe(true);
  });

  it("lets an org admin manage but not create organizations", () => {
    const admin = ctx({ orgRole: "org_admin" });
    expect(can(admin, "org:manage")).toBe(true);
    expect(can(admin, "org:create")).toBe(false);
  });

  it("gives a user no permissions in an organization they do not belong to", () => {
    // accessFor() yields orgRole: null for a non-member, which is this case.
    expect(can(ctx({ orgRole: null }), "progress:view_org")).toBe(false);
  });
});

describe("department manager scoping", () => {
  const manager = ctx({ orgRole: "department_manager", managedDepartmentIds: ["dept-a"] });

  it("allows action inside a managed department", () => {
    expect(canInDepartment(manager, "department:assign_users", "dept-a")).toBe(true);
  });

  it("denies the same action in a sibling department", () => {
    expect(canInDepartment(manager, "department:assign_users", "dept-b")).toBe(false);
  });

  it("denies an organization-wide action with no department scope", () => {
    // The spec grants department managers no org-wide view; a missing
    // department must not silently widen a "limited" grant.
    expect(canInDepartment(manager, "progress:view_org", null)).toBe(false);
  });

  it("still allows an org admin everywhere without managed departments", () => {
    const admin = ctx({ orgRole: "org_admin" });
    expect(canInDepartment(admin, "progress:view_org", "any-dept")).toBe(true);
    expect(canInDepartment(admin, "progress:view_org", null)).toBe(true);
  });
});

describe("attempt visibility", () => {
  const attempt = { userId: "learner-1", organizationId: "org-1", departmentId: "dept-a" };

  it("lets a learner read their own attempt", () => {
    expect(canViewAttempt(ctx({ orgRole: "learner" }), attempt, "learner-1")).toBe(true);
  });

  it("stops a learner reading someone else's attempt", () => {
    expect(canViewAttempt(ctx({ orgRole: "learner" }), attempt, "learner-2")).toBe(false);
  });

  it("lets an org admin read an attempt in their organization", () => {
    expect(canViewAttempt(ctx({ orgRole: "org_admin" }), attempt, "someone-else")).toBe(true);
  });

  it("scopes a department manager to their own department", () => {
    const inScope = ctx({ orgRole: "department_manager", managedDepartmentIds: ["dept-a"] });
    const outOfScope = ctx({ orgRole: "department_manager", managedDepartmentIds: ["dept-z"] });
    expect(canViewAttempt(inScope, attempt, "other")).toBe(true);
    expect(canViewAttempt(outOfScope, attempt, "other")).toBe(false);
  });

  it("does not leak an individual learner's attempt to org staff", () => {
    // No organizationId means a solo attempt — nobody else may read it.
    const solo = { userId: "learner-1", organizationId: null, departmentId: null };
    expect(canViewAttempt(ctx({ orgRole: "org_owner" }), solo, "admin-1")).toBe(false);
  });
});

describe("organization progress access", () => {
  /**
   * Regression: progressForOrganization once queried before checking the
   * permission, so any learner could enumerate organization ids and read other
   * companies' learner names, emails and activity. The guard is `can(ctx,
   * "progress:view_org")` against the caller's REAL membership.
   */
  it("denies a non-member of the organization", () => {
    // accessFor() yields orgRole: null when the user has no membership,
    // regardless of what organization id the client supplied.
    expect(can(ctx({ orgRole: null }), "progress:view_org")).toBe(false);
  });

  it("denies a learner who is a member but has no org-wide view", () => {
    expect(can(ctx({ orgRole: "learner" }), "progress:view_org")).toBe(false);
  });

  it("allows admins, owners and department managers", () => {
    for (const role of ["org_owner", "org_admin", "department_manager"] as const) {
      expect(can(ctx({ orgRole: role }), "progress:view_org")).toBe(true);
    }
  });

  it("allows a platform owner across every organization", () => {
    expect(can(ctx({ platformRoles: ["platform_owner"], orgRole: null }), "progress:view_org")).toBe(true);
  });
});
