import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import nodemailer from 'nodemailer';
import { MAIL_TRANSPORT } from './mail.constants.js';
import { MailService } from './mail.service.js';
import { StudentMailService } from './student-mail.service.js';

/** Résout le nom d'hôte en IPv4 ; renvoie le nom tel quel si la résolution échoue. */
async function toIPv4(host: string | undefined): Promise<string | undefined> {
  if (!host) return host;
  try {
    return (await lookup(host, { family: 4 })).address;
  } catch {
    return host;
  }
}

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const { host, port, secure, user, pass } = config.getOrThrow('mail');
        return nodemailer.createTransport({
          // Nodemailer choisit au hasard parmi les adresses IPv4 et IPv6 du
          // serveur SMTP ; sur un hébergeur sans IPv6 cela donne ENETUNREACH.
          // On se connecte donc à une adresse IPv4, en gardant le vrai nom
          // d'hôte pour la vérification du certificat TLS.
          host: await toIPv4(host),
          port,
          secure,
          auth: { user, pass },
          tls: host ? { servername: host } : undefined,
          // Échouer vite plutôt que d'attendre 2 minutes par défaut
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        });
      },
    },
    MailService,
    StudentMailService,
  ],
  exports: [MailService, StudentMailService],
})
export class MailModule {}
