import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { Transporter } from 'nodemailer';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { MAIL_TRANSPORT } from '../../src/mail/mail.constants.js';

/** Email capté par le faux transport SMTP. */
export interface SentMail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  /** Emails « envoyés » pendant le test, dans l'ordre. */
  mails: SentMail[];
  /** Vide la base entre deux tests. */
  reset: () => Promise<void>;
  get: (url: string) => supertest.Test;
  post: (url: string) => supertest.Test;
  patch: (url: string) => supertest.Test;
  delete: (url: string) => supertest.Test;
}

const TABLES = [
  'pairings',
  'pairing_constraints',
  'pairing_sessions',
  'profile_invitations',
  'students',
];

/**
 * Démarre l'application complète (base comprise) avec un transport SMTP factice :
 * les tests n'ont besoin d'aucun serveur de messagerie et peuvent inspecter
 * les emails réellement produits.
 */
export async function createTestApp(): Promise<TestApp> {
  const mails: SentMail[] = [];

  const transport = {
    sendMail: async (options: Omit<SentMail, 'from'> & { from?: string }) => {
      mails.push({
        from: options.from ?? '',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      return { messageId: `test-${mails.length}` };
    },
    verify: async () => true,
    close: () => undefined,
  } as unknown as Transporter;

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(transport)
    .compile();

  const app = moduleRef.createNestApplication();
  // Même configuration que src/main.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const dataSource = app.get(DataSource);

  return {
    app,
    dataSource,
    mails,
    reset: async () => {
      await dataSource.query(
        `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`,
      );
      mails.length = 0;
    },
    get: (url) => supertest(app.getHttpServer()).get(url),
    post: (url) => supertest(app.getHttpServer()).post(url),
    patch: (url) => supertest(app.getHttpServer()).patch(url),
    delete: (url) => supertest(app.getHttpServer()).delete(url),
  };
}

/** Extrait le token d'invitation du dernier email envoyé. */
export function extractToken(mail: SentMail): string {
  const match = mail.html.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Aucun token trouvé dans le contenu de l'email");
  return match[1]!;
}
