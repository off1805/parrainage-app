import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MAIL_TRANSPORT } from './mail.constants.js';
import { MailService } from './mail.service.js';
import { StudentMailService } from './student-mail.service.js';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { host, port, secure, user, pass } = config.getOrThrow('mail');
        return nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });
      },
    },
    MailService,
    StudentMailService,
  ],
  exports: [MailService, StudentMailService],
})
export class MailModule {}
