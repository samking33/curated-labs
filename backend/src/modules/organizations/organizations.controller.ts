import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  acceptInvitationRequestSchema,
  createDepartmentRequestSchema,
  createInvitationRequestSchema,
  createOrganizationRequestSchema,
  updateMemberRequestSchema,
} from "@curated-labs/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { AttemptsService } from "../attempts/attempts.service";
import { InvitationsService } from "../invitations/invitations.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "./organizations.service";

const updateOrgSchema = z.object({ name: z.string().min(2).max(120).optional() });
const addDeptMemberSchema = z.object({ userId: z.string().uuid(), isManager: z.boolean().default(false) });

@Controller()
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly attempts: AttemptsService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /* ---------------------------------------------------------- onboarding */

  @Post("onboarding/individual")
  async onboardIndividual(@CurrentUser() user: AuthContext) {
    await this.prisma.user.update({ where: { id: user.userId }, data: { accountKind: "individual" } });
    return { ok: true, accountKind: "individual" };
  }

  @Post("onboarding/organizations")
  async onboardOrganization(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createOrganizationRequestSchema)) body: z.infer<typeof createOrganizationRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    const org = await this.orgs.create(user, body);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: org.id,
      action: "organization.created",
      targetType: "organization",
      targetId: org.id,
      metadata: { slug: org.slug },
      request,
    });
    return org;
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: z.infer<typeof acceptInvitationRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    const invitation = await this.invitations.accept(user, body.token);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: invitation.organizationId,
      action: "invitation.accepted",
      targetType: "invitation",
      targetId: invitation.id,
      request,
    });
    return { ok: true, organizationId: invitation.organizationId };
  }

  /* -------------------------------------------------------- organizations */

  @Get("organizations")
  list(@CurrentUser() user: AuthContext) {
    return this.orgs.listForUser(user);
  }

  @Get("organizations/:organizationId")
  get(@CurrentUser() user: AuthContext, @Param("organizationId") id: string) {
    return this.orgs.get(user, id);
  }

  @Patch("organizations/:organizationId")
  async update(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>,
    @Req() request: FastifyRequest,
  ) {
    const org = await this.orgs.update(user, id, body);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: id,
      action: "organization.updated",
      targetType: "organization",
      targetId: id,
      request,
    });
    return org;
  }

  @Get("organizations/:organizationId/members")
  members(@CurrentUser() user: AuthContext, @Param("organizationId") id: string) {
    return this.orgs.listMembers(user, id);
  }

  @Patch("organizations/:organizationId/members/:userId")
  async updateMember(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberRequestSchema)) body: z.infer<typeof updateMemberRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.orgs.updateMemberRole(user, id, targetUserId, body.role);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: id,
      action: "member.role_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: { role: body.role },
      request,
    });
    return result;
  }

  @Delete("organizations/:organizationId/members/:userId")
  async removeMember(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("userId") targetUserId: string,
    @Req() request: FastifyRequest,
  ) {
    await this.orgs.removeMember(user, id, targetUserId);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: id,
      action: "member.removed",
      targetType: "user",
      targetId: targetUserId,
      request,
    });
    return { ok: true };
  }

  /* ---------------------------------------------------------- departments */

  @Get("organizations/:organizationId/departments")
  departments(@CurrentUser() user: AuthContext, @Param("organizationId") id: string) {
    return this.orgs.listDepartments(user, id);
  }

  @Post("organizations/:organizationId/departments")
  createDepartment(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Body(new ZodValidationPipe(createDepartmentRequestSchema)) body: z.infer<typeof createDepartmentRequestSchema>,
  ) {
    return this.orgs.createDepartment(user, id, body);
  }

  @Patch("organizations/:organizationId/departments/:departmentId")
  updateDepartment(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("departmentId") departmentId: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>,
  ) {
    return this.orgs.updateDepartment(user, id, departmentId, body);
  }

  @Delete("organizations/:organizationId/departments/:departmentId")
  async deleteDepartment(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("departmentId") departmentId: string,
  ) {
    await this.orgs.deleteDepartment(user, id, departmentId);
    return { ok: true };
  }

  @Post("organizations/:organizationId/departments/:departmentId/members")
  addDepartmentMember(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("departmentId") departmentId: string,
    @Body(new ZodValidationPipe(addDeptMemberSchema)) body: z.infer<typeof addDeptMemberSchema>,
  ) {
    return this.orgs.addDepartmentMember(user, id, departmentId, body);
  }

  @Delete("organizations/:organizationId/departments/:departmentId/members/:userId")
  async removeDepartmentMember(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("departmentId") departmentId: string,
    @Param("userId") targetUserId: string,
  ) {
    await this.orgs.removeDepartmentMember(user, id, departmentId, targetUserId);
    return { ok: true };
  }

  /* ---------------------------------------------------------- invitations */

  @Get("organizations/:organizationId/invitations")
  listInvitations(@CurrentUser() user: AuthContext, @Param("organizationId") id: string) {
    return this.invitations.list(user, id);
  }

  @Post("organizations/:organizationId/invitations")
  async createInvitation(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: z.infer<typeof createInvitationRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    const { invitation, token } = await this.invitations.create(user, id, body);
    await this.audit.record({
      actorUserId: user.userId,
      organizationId: id,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: body.email, role: body.role },
      request,
    });
    // The plaintext token is returned once. Email delivery is out of scope for
    // this version, so the admin copies the link from the UI.
    return { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, token };
  }

  @Post("organizations/:organizationId/invitations/:invitationId/revoke")
  async revokeInvitation(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.revoke(user, id, invitationId);
  }

  /* ------------------------------------------------------------- progress */

  @Get("organizations/:organizationId/progress")
  orgProgress(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Query("departmentId") departmentId?: string,
  ) {
    return this.attempts.progressForOrganization(user, id, departmentId);
  }

  @Get("organizations/:organizationId/departments/:departmentId/progress")
  departmentProgress(
    @CurrentUser() user: AuthContext,
    @Param("organizationId") id: string,
    @Param("departmentId") departmentId: string,
  ) {
    return this.attempts.progressForOrganization(user, id, departmentId);
  }
}
