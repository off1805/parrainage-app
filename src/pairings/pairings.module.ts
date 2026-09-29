import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsModule } from '../students/students.module.js';
import { PairingConstraint } from './pairing-constraint.entity.js';
import { Pairing } from './pairing.entity.js';
import { PairingSession } from './pairing-session.entity.js';
import { PairingAlgorithmService } from './pairing-algorithm.service.js';
import { PairingsController } from './pairings.controller.js';
import { PairingsService } from './pairings.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PairingSession, Pairing, PairingConstraint]),
    StudentsModule,
  ],
  controllers: [PairingsController],
  providers: [PairingsService, PairingAlgorithmService],
  exports: [PairingsService],
})
export class PairingsModule {}
