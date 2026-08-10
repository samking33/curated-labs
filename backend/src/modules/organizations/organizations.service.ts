import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { can, canInDepartment, type OrgRole } from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../../common/guards/session.guard";

/**
 * Organizations, departments and memberships (§17).
 *
 * Every method resolves the caller's real role from the database before acting.
 * An organizationId in the URL is treated as a claim to verify, never as proof
 * of membership (§13).
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws unless the caller holds `permission` in this organization. */
  private assert(user: AuthContext, organizationId: string, permission: Parameters<typeof can>[1]) {
    const ctx = user.accessFor(organizationId);
    if (!ctx.orgRole && !ctx.platformRoles.includes("platform_owner")) {
      // Don't confirm the org exists to a non-member.
      throw new NotFoundException("Organization not found.");
    }
    if (!can(ctx, permission)) throw new ForbiddenException("You do not have access to this resource.");
    return ctx;
  }

  async listForUser(user: AuthContext) {
    const orgs = await this.prisma.organization.findMany({
      where: { deletedAt: null, memberships: { some: { userId: user.userId, deletedAt: null } } },
      orderBy: { name: "asc" },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      role: user.organizations.find((m) => m.id === o.id)?.role ?? "learner",
    }));
  }

  /** Creating an org makes the creator its owner, inside one transaction. */
  async create(user: AuthContext, input: { name: string; slug: string }) {
    const clash = await this.prisma.organization.findUnique({ where: { slug: input.slug } });
    if (clash) throw new BadRequestException("That organization URL is already taken.");

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug: input.slug, ownerUserId: user.userId },
      });
      await tx.organizationMembership.create({
        data: { organizationId: org.id, userId: user.userId, role: "org_owner" },
      });
      await tx.user.update({ where: { id: user.userId }, data: { accountKind: "organization" } });
      return org;
    });
  }

  async get(user: AuthContext, organizationId: string) {
    this.assert(user, organizationId, "progress:view_org");
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException("Organization not found.");
    return org;
  }

  async update(user: AuthContext, organizationId: string, data: { name?: string }) {
    this.assert(user, organizationId, "org:manage");
    return this.prisma.organization.update({ where: { id: organizationId }, data });
  }

  async listMembers(user: AuthContext, organizationId: string) {
    this.assert(user, organizationId, "progress:view_org");
    const members = await this.prisma.organizationMembership.findMany({
      where: { organizationId, deletedAt: null },
      include: { user: true, },
      orderBy: { createdAt: "asc" },
    });
    const departments = await this.prisma.departmentMembership.findMany({
      where: { department: { organizationId } },
      include: { department: true },
    });
    return members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      departments: departments
        .filter((d) => d.userId === m.userId)
        .map((d) => ({ id: d.departmentId, name: d.department.name, isManager: d.isManager })),
    }));
  }

  /**
   * Role changes are the classic privilege-escalation path, so two extra rules
   * apply beyond the permission check: nobody may promote themselves, and the
   * last remaining owner cannot be demoted (which would orphan the org).
   */
  async updateMemberRole(user: AuthContext, organizationId: string, targetUserId: string, role: OrgRole) {
    this.assert(user, organizationId, "org:manage");
    if (targetUserId === user.userId) {
      throw new ForbiddenException("You cannot change your own role.");
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });
    if (!membership || membership.deletedAt) throw new NotFoundException("Member not found.");

    if (membership.role === "org_owner" && role !== "org_owner") {
      await this.assertNotLastOwner(organizationId);
    }
    return this.prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
      data: { role },
    });
  }

  async removeMember(user: AuthContext, organizationId: string, targetUserId: string) {
    this.assert(user, organizationId, "org:manage");
    if (targetUserId === user.userId) throw new ForbiddenException("You cannot remove yourself.");
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });
    if (!membership || membership.deletedAt) throw new NotFoundException("Member not found.");
    if (membership.role === "org_owner") await this.assertNotLastOwner(organizationId);

    // Soft delete keeps historical attempts attributable to the organization.
    await this.prisma.$transaction([
      this.prisma.organizationMembership.update({
        where: { organizationId_userId: { organizationId, userId: targetUserId } },
        data: { deletedAt: new Date() },
      }),
      this.prisma.departmentMembership.deleteMany({
        where: { userId: targetUserId, department: { organizationId } },
      }),
    ]);
  }

  private async assertNotLastOwner(organizationId: string) {
    const owners = await this.prisma.organizationMembership.count({
      where: { organizationId, role: "org_owner", deletedAt: null },
    });
    if (owners <= 1) throw new BadRequestException("An organization must keep at least one owner.");
  }

  /* ------------------------------------------------------------ departments */

  async listDepartments(user: AuthContext, organizationId: string) {
    this.assert(user, organizationId, "progress:view_org");
    return this.prisma.department.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    });
  }

  async createDepartment(
    user: AuthContext,
    organizationId: string,
    input: { name: string; slug: string; parentDepartmentId?: string | null },
  ) {
    const ctx = this.assert(user, organizationId, "department:manage");
    // A department manager holds only a "limited" grant, which does not extend
    // to creating new top-level departments.
    if (!can({ ...ctx, orgRole: ctx.orgRole }, "org:manage") && ctx.orgRole === "department_manager") {
      throw new ForbiddenException("Department managers cannot create departments.");
    }
    if (input.parentDepartmentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: input.parentDepartmentId, organizationId, deletedAt: null },
      });
      if (!parent) throw new BadRequestException("Parent department not found in this organization.");
    }
    const clash = await this.prisma.department.findFirst({
      where: { organizationId, slug: input.slug, deletedAt: null },
    });
    if (clash) throw new BadRequestException("A department with that URL already exists.");

    return this.prisma.department.create({
      data: {
        organizationId,
        name: input.name,
        slug: input.slug,
        parentDepartmentId: input.parentDepartmentId ?? null,
      },
    });
  }

  async updateDepartment(user: AuthContext, organizationId: string, departmentId: string, data: { name?: string }) {
    const ctx = this.assert(user, organizationId, "department:manage");
    if (!canInDepartment(ctx, "department:manage", departmentId)) {
      throw new ForbiddenException("You do not manage this department.");
    }
    await this.assertDepartmentInOrg(organizationId, departmentId);
    return this.prisma.department.update({ where: { id: departmentId }, data });
  }

  async deleteDepartment(user: AuthContext, organizationId: string, departmentId: string) {
    this.assert(user, organizationId, "org:manage");
    await this.assertDepartmentInOrg(organizationId, departmentId);
    await this.prisma.department.update({ where: { id: departmentId }, data: { deletedAt: new Date() } });
  }

  async addDepartmentMember(
    user: AuthContext,
    organizationId: string,
    departmentId: string,
    input: { userId: string; isManager?: boolean },
  ) {
    const ctx = this.assert(user, organizationId, "department:assign_users");
    if (!canInDepartment(ctx, "department:assign_users", departmentId)) {
      throw new ForbiddenException("You do not manage this department.");
    }
    await this.assertDepartmentInOrg(organizationId, departmentId);

    // Only existing org members can be placed in a department.
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: input.userId } },
    });
    if (!membership || membership.deletedAt) {
      throw new BadRequestException("That user is not a member of this organization.");
    }
    // Granting manager scope is an escalation; keep it to org-level admins.
    if (input.isManager && !can(ctx, "org:manage")) {
      throw new ForbiddenException("Only organization admins can grant manager scope.");
    }

    return this.prisma.departmentMembership.upsert({
      where: { departmentId_userId: { departmentId, userId: input.userId } },
      create: { departmentId, userId: input.userId, isManager: input.isManager ?? false },
      update: { isManager: input.isManager ?? false },
    });
  }

  async removeDepartmentMember(user: AuthContext, organizationId: string, departmentId: string, targetUserId: string) {
    const ctx = this.assert(user, organizationId, "department:assign_users");
    if (!canInDepartment(ctx, "department:assign_users", departmentId)) {
      throw new ForbiddenException("You do not manage this department.");
    }
    await this.assertDepartmentInOrg(organizationId, departmentId);
    await this.prisma.departmentMembership.deleteMany({ where: { departmentId, userId: targetUserId } });
  }

  /** Guards against reaching another org's department by id. */
  private async assertDepartmentInOrg(organizationId: string, departmentId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, organizationId, deletedAt: null },
    });
    if (!dept) throw new NotFoundException("Department not found.");
    return dept;
  }
}
