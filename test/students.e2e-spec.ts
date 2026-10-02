import { createTestApp } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';

describe("Ajout manuel d'un étudiant (e2e)", () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  it('crée un ING4 avec sa capacité et normalise l’email', async () => {
    const { body } = await ctx
      .post('/students')
      .send({ firstName: ' Léa ', lastName: 'Mbarga', email: 'Lea.Mbarga@SJI.cm', level: 'ING4', maxMentees: 2 })
      .expect(201);
    expect(body).toMatchObject({ firstName: 'Léa', email: 'lea.mbarga@sji.cm', level: 'ING4', maxMentees: 2, matricule: null });
  });

  it('ignore la capacité pour un ING3', async () => {
    const { body } = await ctx
      .post('/students')
      .send({ firstName: 'Yann', lastName: 'Fotso', email: 'yann@sji.cm', level: 'ING3', maxMentees: 4 })
      .expect(201);
    expect(body.maxMentees).toBeNull();
  });

  it('exige la capacité pour un ING4 et refuse un email déjà pris', async () => {
    await ctx.post('/students').send({ firstName: 'A', lastName: 'B', email: 'a@sji.cm', level: 'ING4' }).expect(400);
    await ctx.post('/students').send({ firstName: 'A', lastName: 'B', email: 'a@sji.cm', level: 'ING3' }).expect(201);
    await ctx.post('/students').send({ firstName: 'C', lastName: 'D', email: 'A@sji.cm', level: 'ING3' }).expect(409);
  });

  describe('modification', () => {
    const create = async (body: Record<string, unknown>) =>
      (await ctx.post('/students').send(body).expect(201)).body as { id: string };

    it('modifie les informations et normalise email, matricule et WhatsApp', async () => {
      const { id } = await create({ firstName: 'Léa', lastName: 'M', email: 'lea@sji.cm', matricule: 'X1', level: 'ING3' });
      const { body } = await ctx
        .patch(`/students/${id}`)
        .send({ lastName: 'Mbarga', email: 'Lea.Mbarga@SJI.cm', matricule: '', whatsapp: '+237690000000', section: 'EN' })
        .expect(200);
      expect(body).toMatchObject({ lastName: 'Mbarga', email: 'lea.mbarga@sji.cm', matricule: null, whatsapp: '+237690000000', section: 'EN' });
    });

    it('gère le passage ING3 ↔ ING4 et la capacité', async () => {
      const { id } = await create({ firstName: 'Yann', lastName: 'F', email: 'yann@sji.cm', level: 'ING3' });
      await ctx.patch(`/students/${id}`).send({ level: 'ING4' }).expect(400);
      let { body } = await ctx.patch(`/students/${id}`).send({ level: 'ING4', maxMentees: 2 }).expect(200);
      expect(body.maxMentees).toBe(2);
      ({ body } = await ctx.patch(`/students/${id}`).send({ level: 'ING3' }).expect(200));
      expect(body.maxMentees).toBeNull();
    });

    it('refuse un email déjà pris et un changement de niveau avec contraintes', async () => {
      const a = await create({ firstName: 'A', lastName: 'A', email: 'a@sji.cm', level: 'ING4', maxMentees: 1 });
      const b = await create({ firstName: 'B', lastName: 'B', email: 'b@sji.cm', level: 'ING3' });
      await ctx.patch(`/students/${b.id}`).send({ email: 'A@sji.cm' }).expect(409);
      await ctx.post('/pairing-constraints').send({ sponsorId: a.id, menteeId: b.id, type: 'FORBIDDEN' }).expect(201);
      await ctx.patch(`/students/${b.id}`).send({ section: 'EN' }).expect(409);
      await ctx.patch(`/students/${b.id}`).send({ firstName: 'Bea' }).expect(200);
    });
  });

  describe('retrait', () => {
    const create = async (body: Record<string, unknown>) =>
      (await ctx.post('/students').send(body).expect(201)).body as { id: string };

    it('retire un étudiant avec ses invitations et contraintes', async () => {
      const a = await create({ firstName: 'A', lastName: 'A', email: 'a@sji.cm', level: 'ING4', maxMentees: 1 });
      const b = await create({ firstName: 'B', lastName: 'B', email: 'b@sji.cm', level: 'ING3' });
      await ctx.post('/pairing-constraints').send({ sponsorId: a.id, menteeId: b.id, type: 'FORBIDDEN' }).expect(201);
      await ctx.post(`/students/${b.id}/invitations`).expect(201);

      const { body } = await ctx.delete(`/students/${b.id}`).expect(200);
      expect(body).toEqual({ deleted: true, resetSessions: 0 });
      await ctx.get(`/students/${b.id}`).expect(404);
      expect((await ctx.get('/pairing-constraints').expect(200)).body).toHaveLength(0);
      expect((await ctx.get('/invitations/overview').expect(200)).body.students).toHaveLength(1);
    });

    it('annule un tirage non finalisé et refuse si la session est finalisée', async () => {
      const a = await create({ firstName: 'A', lastName: 'A', email: 'a@sji.cm', level: 'ING4', maxMentees: 2 });
      const b = await create({ firstName: 'B', lastName: 'B', email: 'b@sji.cm', level: 'ING3' });
      const c = await create({ firstName: 'C', lastName: 'C', email: 'c@sji.cm', level: 'ING3' });
      const { body: session } = await ctx.post('/pairing-sessions').send({}).expect(201);
      await ctx.post(`/pairing-sessions/${session.id}/generate`).expect(201);

      const { body } = await ctx.delete(`/students/${c.id}`).expect(200);
      expect(body.resetSessions).toBe(1);
      const { body: view } = await ctx.get(`/pairing-sessions/${session.id}`).expect(200);
      expect(view).toMatchObject({ status: 'DRAFT', pairings: [] });

      await ctx.post(`/pairing-sessions/${session.id}/generate`).expect(201);
      await ctx.post(`/pairing-sessions/${session.id}/finalize`).expect(201);
      await ctx.delete(`/students/${b.id}`).expect(409);
      await ctx.delete(`/students/${a.id}`).expect(409);
    });

    it('retourne 404 pour un étudiant inexistant', async () => {
      await ctx.delete('/students/00000000-0000-4000-8000-000000000000').expect(404);
    });
  });
});
