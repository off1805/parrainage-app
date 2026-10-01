import type { DataSource } from 'typeorm';
import {
  ProfileInvitation,
  InvitationStatus,
} from '../src/invitations/invitation.entity.js';
import { createTestApp, extractToken } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';
import { seedStudents } from './utils/fixtures.js';

describe('Invitations de profil (e2e)', () => {
  let ctx: TestApp;
  let studentId: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    const seeded = await seedStudents(ctx.dataSource, [
      { firstName: 'Alice', lastName: 'Bernard', level: 'ING3' as never },
    ]);
    studentId = seeded['Alice Bernard']!.id;
    dataSource = ctx.dataSource;
  });

  it('envoie un email contenant un lien vers le formulaire du front', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);

    expect(ctx.mails).toHaveLength(1);
    const [mail] = ctx.mails;
    expect(mail!.to).toBe('alice.bernard1@school.fr');
    expect(mail!.subject).toContain('parrainage');
    expect(mail!.from).toContain('parrainage@example.com');
    expect(mail!.html).toContain('Alice');
    expect(mail!.html).toContain('http://localhost:5173/invitation?token=');
  });

  it('ne renvoie jamais le token ni son hash dans la réponse API', async () => {
    const { body } = await ctx
      .post(`/students/${studentId}/invitations`)
      .expect(201);

    expect(body.invitation.tokenHash).toBeUndefined();
    expect(body.invitation.token).toBeUndefined();
    expect(JSON.stringify(body.invitation)).not.toContain(
      extractToken(ctx.mails[0]!),
    );
    expect(body.invitation.status).toBe(InvitationStatus.PENDING);
    expect(body.email).toEqual({ total: 1, sent: 1, failed: [] });
  });

  it('stocke uniquement le hash du token en base', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);

    const stored = await dataSource
      .getRepository(ProfileInvitation)
      .findOneOrFail({
        where: { studentId },
      });
    const token = extractToken(ctx.mails[0]!);

    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('permet de vérifier le token sans divulguer de donnée personnelle', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const token = extractToken(ctx.mails[0]!);

    const { body } = await ctx
      .get(`/invitations/verify?token=${token}`)
      .expect(200);

    expect(body.firstName).toBe('Alice');
    expect(body.expiresAt).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('@');
    expect(JSON.stringify(body)).not.toContain('school.fr');
    expect(body.matricule).toBeUndefined();
  });

  it('enregistre la photo et le WhatsApp puis invalide le token', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const token = extractToken(ctx.mails[0]!);

    await ctx
      .post('/invitations/complete')
      .send({
        token,
        profilePictureUrl: 'https://cdn.school.fr/alice.jpg',
        whatsapp: '+33612345678',
      })
      .expect(201);

    const { body: student } = await ctx
      .get(`/students/${studentId}`)
      .expect(200);
    expect(student.profilePictureUrl).toBe('https://cdn.school.fr/alice.jpg');
    expect(student.whatsapp).toBe('+33612345678');

    const stored = await dataSource
      .getRepository(ProfileInvitation)
      .findOneOrFail({
        where: { studentId },
      });
    expect(stored.status).toBe(InvitationStatus.USED);
    expect(stored.usedAt).toBeTruthy();

    // Usage unique : le rejeu est refusé.
    await ctx
      .post('/invitations/complete')
      .send({
        token,
        profilePictureUrl: 'https://cdn.school.fr/autre.jpg',
        whatsapp: '+33699999999',
      })
      .expect(410)
      .expect(({ body }) =>
        expect(body.message).toContain('déjà été utilisée'),
      );

    const { body: afterReplay } = await ctx
      .get(`/students/${studentId}`)
      .expect(200);
    expect(afterReplay.profilePictureUrl).toBe(
      'https://cdn.school.fr/alice.jpg',
    );
  });

  it("n'autorise que la photo et le WhatsApp via le formulaire", async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const token = extractToken(ctx.mails[0]!);
    const payload = {
      token,
      profilePictureUrl: 'https://cdn.school.fr/alice.jpg',
      whatsapp: '+33612345678',
    };

    for (const forbidden of [
      { email: 'pirate@evil.fr' },
      { firstName: 'Hacker' },
      { lastName: 'Dupont' },
      { level: 'ING4' },
      { matricule: 'HACK1' },
    ]) {
      await ctx
        .post('/invitations/complete')
        .send({ ...payload, ...forbidden })
        .expect(400);
    }

    // L'étudiant n'a pas été modifié par les tentatives rejetées.
    const { body } = await ctx.get(`/students/${studentId}`).expect(200);
    expect(body.email).toBe('alice.bernard1@school.fr');
    expect(body.firstName).toBe('Alice');
    expect(body.level).toBe('ING3');
    expect(body.whatsapp).toBeNull();
  });

  it('refuse un token inconnu, vide ou malformé', async () => {
    await ctx
      .get('/invitations/verify?token=aaaaaaaaaaaaaaaaaaaaaaaa')
      .expect(404);
    await ctx.get('/invitations/verify?token=court').expect(400);
    await ctx
      .post('/invitations/complete')
      .send({
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        profilePictureUrl: 'https://example.com/b.jpg',
        whatsapp: '+33612345678',
      })
      .expect(404);
  });

  it('refuse un WhatsApp mal formé', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const token = extractToken(ctx.mails[0]!);

    await ctx
      .post('/invitations/complete')
      .send({
        token,
        profilePictureUrl: 'https://cdn.school.fr/a.jpg',
        whatsapp: 'pas-un-numero',
      })
      .expect(400);
  });

  it('annule l invitation précédente lors d un renvoi', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const firstToken = extractToken(ctx.mails[0]!);

    await ctx.post(`/students/${studentId}/invitations/resend`).expect(201);
    const secondToken = extractToken(ctx.mails[1]!);

    expect(secondToken).not.toBe(firstToken);
    expect(ctx.mails).toHaveLength(2);

    // L'ancien token ne fonctionne plus.
    await ctx.get(`/invitations/verify?token=${firstToken}`).expect(410);
    await ctx.get(`/invitations/verify?token=${secondToken}`).expect(200);

    const pending = await ctx.dataSource
      .getRepository(ProfileInvitation)
      .countBy({
        studentId,
        status: InvitationStatus.PENDING,
      });
    expect(pending).toBe(1);
  });

  it('rejette une invitation dont la date d expiration est dépassée', async () => {
    await ctx.post(`/students/${studentId}/invitations`).expect(201);
    const token = extractToken(ctx.mails[0]!);

    await ctx.dataSource
      .getRepository(ProfileInvitation)
      .update({ studentId }, { expiresAt: new Date(Date.now() - 60_000) });

    await ctx
      .get(`/invitations/verify?token=${token}`)
      .expect(410)
      .expect(({ body }) => expect(body.message).toContain('expiré'));

    // L'expiration est appliquée paresseusement : le statut passe à EXPIRED.
    const stored = await ctx.dataSource
      .getRepository(ProfileInvitation)
      .findOneOrFail({
        where: { studentId },
      });
    expect(stored.status).toBe(InvitationStatus.EXPIRED);
  });

  it('retourne 404 pour un étudiant inexistant', async () => {
    await ctx
      .post('/students/00000000-0000-0000-0000-000000000000/invitations')
      .expect(404);
    expect(ctx.mails).toHaveLength(0);
  });
});
