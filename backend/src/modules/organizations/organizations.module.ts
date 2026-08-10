import { Module } from "@nestjs/common";
import { AttemptsModule } from "../attempts/attempts.module";
import { InvitationsService } from "../invitations/invitations.service";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [AttemptsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, InvitationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
