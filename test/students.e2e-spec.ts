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
});
