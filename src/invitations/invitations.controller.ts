import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { BulkInvitationsDto } from './dto/bulk-invitations.dto.js';
import { CompleteProfileDto } from './dto/complete-profile.dto.js';
import { VerifyInvitationDto } from './dto/verify-invitation.dto.js';
import { InvitationsService } from './invitations.service.js';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('students/:studentId/invitations')
  create(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.invitationsService.create(studentId);
  }

  /** Suivi : dernière invitation et livraison du mail, pour chaque étudiant. */
  @Get('invitations/overview')
  overview() {
    return this.invitationsService.overview();
  }

  /** Invite plusieurs étudiants d'un coup (par défaut : profils incomplets). */
  @Post('invitations/bulk')
  bulk(@Body() dto: BulkInvitationsDto) {
    return this.invitationsService.createBulk(dto.studentIds);
  }

  @Post('students/:studentId/invitations/resend')
  resend(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.invitationsService.resend(studentId);
  }

  @Get('invitations/verify')
  verify(@Query() query: VerifyInvitationDto) {
    return this.invitationsService.verify(query.token);
  }

  @Post('invitations/complete')
  complete(@Body() dto: CompleteProfileDto) {
    return this.invitationsService.complete(dto);
  }
}
