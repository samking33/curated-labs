import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { INVITATION_TTL_MS, can, canInDepartment, type OrgRole } from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../../common/guards/session.guard";

/**
 * Organization invitations.
 *
 * Only the SHA-256 of the token is stored, so the database cannot be used to
 * mint working invitation links. The plaintext is returned exactly once, at
 * creation, for the caller to deliver.
 */
@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  async list(user: AuthContext, organizationId: string) {
    const ctx = user.accessFor(organizationId);
    if (!can(ctx, "invitation:write")) throw new ForbiddenException("You cannot manage invitations.");
    return this.prisma.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { department: true, invitedBy: { select: { name: true, email: true } } },
    });
  }

  async create(
    user: AuthContext,
    organizationId: string,
    input: { email: string; role: OrgRole; departmentId?: string | null },
  ) {
    const ctx = user.accessFor(organizationId);
    if (!can(ctx, "invitation:write")) throw new ForbiddenException("You cannot invite users.");

    // A department manager may invite only into departments they manage.
    if (!canInDepartment(ctx, "invitation:write", input.departmentId)) {
      throw new ForbiddenException("You can only invite into departments you manage.");
    }
    // Nobody may invite at a role above their own: that is privilege escalation
    // by proxy. Owners are the only ones who can mint another owner.
    if (input.role === "org_owner" && ctx.orgRole !== "org_owner" && !ctx.platformRoles.includes("platform_owner")) {
      throw new ForbiddenException("Only an organization owner can invite another owner.");
    }
    if (input.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: input.departmentId, organizationId, deletedAt: null },
      });
      if (!dept) throw new BadRequestException("Department not found in this organization.");
    }

    const existing = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, user: { email: input.email }, deletedAt: null },
    });
    if (existing) throw new BadRequestException("That person is already a member.");

    // Supersede any live invite so a resend cannot leave two valid tokens.
    await this.prisma.invitation.updateMany({
      where: { organizationId, email: input.email, status: "pending" },
      data: { status: "revoked", revokedAt: new Date() },
    });

    const token = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        departmentId: input.departmentId ?? null,
        email: input.email,
        role: input.role,
        tokenHash: this.hash(token),
        invitedByUserId: user.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    // Plaintext token surfaces here and nowhere else, ever.
    return { invitation, token };
  }

  async revoke(user: AuthContext, organizationId: string, invitationId: string) {
    const ctx = user.accessFor(organizationId);
    if (!can(ctx, "invitation:write")) throw new ForbiddenException("You cannot manage invitations.");
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId } });
    if (!invitation) throw new NotFoundException("Invitation not found.");
    if (invitation.status !== "pending") throw new BadRequestException("That invitation is no longer pending.");
    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  /**
   * Accepting binds the invitation to the signed-in user. The email on the
   * invite must match the verified Google address, otherwise a leaked link
   * would let anyone join the organization.
   */
  async accept(user: AuthContext, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!invitation) throw new NotFoundException("That invitation link is not valid.");
    if (invitation.status !== "pending") throw new BadRequestException("That invitation has already been used.");

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
      throw new BadRequestException("That invitation has expired.");
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException("This invitation was sent to a different email address.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.userId } },
        create: { organizationId: invitation.organizationId, userId: user.userId, role: invitation.role },
        update: { role: invitation.role, deletedAt: null },
      });
      if (invitation.departmentId) {
        await tx.departmentMembership.upsert({
          where: { departmentId_userId: { departmentId: invitation.departmentId, userId: user.userId } },
          create: { departmentId: invitation.departmentId, userId: user.userId, isManager: invitation.role === "department_manager" },
          update: {},
        });
      }
      await tx.user.update({ where: { id: user.userId }, data: { accountKind: "organization" } });
      return tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date(), acceptedByUserId: user.userId },
      });
    });
  }
}
