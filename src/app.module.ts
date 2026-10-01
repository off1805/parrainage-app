import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiKeyGuard } from './common/api-key.guard.js';
import appConfig from './config/app.config.js';
import databaseConfig from './config/database.config.js';
import { envValidationSchema } from './config/env.validation.js';
import { ExportsModule } from './exports/exports.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import mailConfig from './mail/config/mail.config.js';
import { PairingsModule } from './pairings/pairings.module.js';
import { StudentsModule } from './students/students.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, mailConfig],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<TypeOrmModuleOptions>('database'),
    }),
    StudentsModule,
    InvitationsModule,
    PairingsModule,
    ImportsModule,
    ExportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
