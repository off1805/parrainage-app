import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from '../students/student.entity.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Student])],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
