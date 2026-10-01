import { StudentLevel, StudentSection } from '../src/students/student.entity.js';
import { createTestApp } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';
import { csv, importFile, seedStudents } from './utils/fixtures.js';

describe('Sections francophone / anglophone (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedStudents(ctx.dataSource, [
      { firstName: 'Paul', lastName: 'Fr', level: StudentLevel.ING4, maxMentees: 2 },
      { firstName: 'Alice', lastName: 'Fr', level: StudentLevel.ING3 },
      { firstName: 'Bob', lastName: 'Fr', level: StudentLevel.ING3 },
      { firstName: 'John', lastName: 'En', level: StudentLevel.ING4, maxMentees: 1, section: StudentSection.EN },
      { firstName: 'Mary', lastName: 'En', level: StudentLevel.ING3, section: StudentSection.EN },
    ]);
  });

  it('tire chaque section indépendamment, sans mélanger les étudiants', async () => {
    const { body: fr } = await ctx.post('/pairing-sessions').send({}).expect(201);
    const { body: en } = await ctx.post('/pairing-sessions').send({ section: 'EN' }).expect(201);
    expect([fr.section, en.section]).toEqual(['FR', 'EN']);

    const { body: frView } = await ctx.post(`/pairing-sessions/${fr.id}/generate`).expect(201);
    const { body: enView } = await ctx.post(`/pairing-sessions/${en.id}/generate`).expect(201);

    expect(frView.pairings.map((p: { mentee: { firstName: string } }) => p.mentee.firstName).sort()).toEqual(['Alice', 'Bob']);
    expect(enView.pairings).toHaveLength(1);
    expect(enView.pairings[0]).toMatchObject({ sponsor: { firstName: 'John' }, mentee: { firstName: 'Mary' } });

    const { body: onlyEn } = await ctx.get('/pairing-sessions?section=EN').expect(200);
    expect(onlyEn.map((s: { id: string }) => s.id)).toEqual([en.id]);
  });

  it('filtre les étudiants par section et refuse une contrainte entre sections', async () => {
    const { body: en } = await ctx.get('/students?section=EN').expect(200);
    expect(en.map((s: { firstName: string }) => s.firstName).sort()).toEqual(['John', 'Mary']);

    const all = await ctx.get('/students').expect(200);
    const id = (name: string) => all.body.find((s: { firstName: string }) => s.firstName === name).id;
    const res = await ctx
      .post('/pairing-constraints')
      .send({ sponsorId: id('John'), menteeId: id('Alice'), type: 'REQUIRED' })
      .expect(400);
    expect(res.body.code).toBe('SECTION_MISMATCH');

    await ctx.post('/pairing-constraints').send({ sponsorId: id('John'), menteeId: id('Mary'), type: 'FORBIDDEN' }).expect(201);
    const { body: frConstraints } = await ctx.get('/pairing-constraints?section=FR').expect(200);
    const { body: enConstraints } = await ctx.get('/pairing-constraints?section=EN').expect(200);
    expect([frConstraints.length, enConstraints.length]).toEqual([0, 1]);
  });

  it('importe dans une section, par option ou par colonne', async () => {
    await ctx
      .post('/students/import')
      .field('section', 'EN')
      .attach('file', csv('firstName,lastName,email,level\nTom,A,tom@sji.cm,ING3'), { filename: 'en.csv', contentType: 'text/csv' })
      .expect(201);
    const { body } = await importFile(ctx.post, csv('Prénom,Nom,Email,Niveau,Section\nLéa,B,lea@sji.cm,ING3,anglophone\nZoé,C,zoe@sji.cm,ING3,'), 'mix.csv');
    expect(body).toMatchObject({ imported: 2, rejected: 0 });

    const { body: students } = await ctx.get('/students').expect(200);
    const section = (email: string) => students.find((s: { email: string }) => s.email === email).section;
    expect([section('tom@sji.cm'), section('lea@sji.cm'), section('zoe@sji.cm')]).toEqual(['EN', 'EN', 'FR']);
  });
});
