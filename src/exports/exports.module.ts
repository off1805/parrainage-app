import { Module } from '@nestjs/common';
import { PairingsModule } from '../pairings/pairings.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';

@Module({
  imports: [PairingsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
