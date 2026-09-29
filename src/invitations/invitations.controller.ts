import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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
