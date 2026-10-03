import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePairingConstraintDto } from './dto/create-pairing-constraint.dto.js';
import { QueryPairingConstraintsDto } from './dto/query-pairing-constraints.dto.js';
import { SectionQueryDto } from './dto/section-query.dto.js';
import { PairingsService } from './pairings.service.js';

@Controller()
export class PairingsController {
  constructor(private readonly pairingsService: PairingsService) {}

  // ------------------------------------------------------- pairing constraints

  @Get('pairing-constraints')
  findConstraints(@Query() query: QueryPairingConstraintsDto) {
    return this.pairingsService.findConstraints(query);
  }

  @Post('pairing-constraints')
  createConstraint(@Body() dto: CreatePairingConstraintDto) {
    return this.pairingsService.createConstraint(dto);
  }

  @Delete('pairing-constraints/:id')
  @HttpCode(204)
  async deleteConstraint(@Param('id', ParseUUIDPipe) id: string) {
    await this.pairingsService.deleteConstraint(id);
  }

  // --------------------------------------------------------- pairing sessions

  @Get('pairing-sessions')
  findSessions(@Query() query: SectionQueryDto) {
    return this.pairingsService.findSessions(query.section);
  }

  /** Corps facultatif : { section: 'FR' | 'EN' } (francophone par défaut). */
  @Post('pairing-sessions')
  createSession(@Body() dto: SectionQueryDto) {
    return this.pairingsService.createSession(dto.section);
  }

  @Get('pairing-sessions/:id')
  getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.pairingsService.getSession(id);
  }

  @Post('pairing-sessions/:id/validate')
  @HttpCode(200)
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.pairingsService.validate(id);
  }

  @Post('pairing-sessions/:id/generate')
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.pairingsService.generate(id);
  }

  @Post('pairing-sessions/:id/regenerate')
  regenerate(@Param('id', ParseUUIDPipe) id: string) {
    return this.pairingsService.regenerate(id);
  }

  /** Supprime la session et ses binômes (étudiants et contraintes conservés). */
  @Delete('pairing-sessions/:id')
  @HttpCode(204)
  async deleteSession(@Param('id', ParseUUIDPipe) id: string) {
    await this.pairingsService.deleteSession(id);
  }

  @Post('pairing-sessions/:id/finalize')
  finalize(@Param('id', ParseUUIDPipe) id: string) {
    return this.pairingsService.finalize(id);
  }
}
