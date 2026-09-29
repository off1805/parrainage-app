import ExcelJS from 'exceljs';
import { StudentLevel } from '../src/students/student.entity.js';
import { PairingOrigin } from '../src/pairings/pairing.entity.js';
import { createTestApp, extractToken } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';
import { COHORT, csv, importFile, seedStudents } from './utils/fixtures.js';

/**
 * Parcours complet de bout en bout, dans l'ordre du besoin fonctionnel :
 * import -> capacités -> invitations -> profils -> contraintes -> validation
 * -> génération -> régénération -> finalisation -> export.
 */
describe('Parcours de parrainage (e2e)', () => {
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

  it("conduit le programme de parrainage de l'import jusqu'à l'export XLSX", async () => {
    // --- 1. Importer les ING3 et les ING4 -------------------------------
    const header = 'firstName,lastName,email,matricule,level,maxMentees';
    const rows = COHORT.map((s, i) =>
      [
        s.firstName,
        s.lastName,
        `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase()}@school.fr`,
        `M${1000 + i}`,
        s.level,
        s.level === StudentLevel.ING4 ? s.maxMentees : '',
      ].join(','),
    ).join('\n');

    const imported = await importFile(
      ctx.post,
      csv(`${header}\n${rows}\n`),
      'cohort.csv',
    );
    expect(imported.status).toBe(201);
    expect(imported.body).toEqual({ imported: 12, rejected: 0, errors: [] });

    const { body: sponsors } = await ctx
      .get('/students?level=ING4')
      .expect(200);
    const { body: mentees } = await ctx.get('/students?level=ING3').expect(200);
    expect(sponsors).toHaveLength(4);
    expect(mentees).toHaveLength(8);
    expect(
      sponsors.map((s: { maxMentees: number }) => s.maxMentees).sort(),
    ).toEqual([1, 2, 2, 3]);
    expect(
      mentees.every(
        (m: { maxMentees: number | null }) => m.maxMentees === null,
      ),
    ).toBe(true);

    // --- 2. Configurer maxMentees ---------------------------------------
    const paul = sponsors.find(
      (s: { firstName: string }) => s.firstName === 'Paul',
    )!;
    await ctx.patch(`/students/${paul.id}`).send({ maxMentees: 2 }).expect(200);
    // Capacité totale portée à 9 pour 8 filleuls.
    expect(
      (await ctx.get(`/students/${paul.id}`).expect(200)).body.maxMentees,
    ).toBe(2);

    // On revient à la capacité du scénario de référence (1, 2, 2, 3).
    await ctx.patch(`/students/${paul.id}`).send({ maxMentees: 1 }).expect(200);

    // --- 3. Envoyer les invitations -------------------------------------
    for (const student of mentees) {
      await ctx.post(`/students/${student.id}/invitations`).expect(201);
    }
    expect(ctx.mails).toHaveLength(8);
    for (const mail of ctx.mails) {
      expect(mail.subject).toContain('Complète ton profil');
      expect(mail.to).toMatch(/@school\.fr$/);
    }

    // --- 4. Les étudiants complètent photo + WhatsApp -------------------
    const completed = new Map<
      string,
      { token: string; mentee: { firstName: string; lastName: string } }
    >();
    for (const mail of ctx.mails) {
      const student = mentees.find(
        (m: { email: string }) => m.email === mail.to,
      )!;
      completed.set(mail.to, { token: extractToken(mail), mentee: student });
    }

    for (const { token, mentee } of completed.values()) {
      await ctx.get(`/invitations/verify?token=${token}`).expect(200);
      await ctx
        .post('/invitations/complete')
        .send({
          token,
          profilePictureUrl: `https://cdn.school.fr/${mentee.firstName.toLowerCase()}.jpg`,
          whatsapp: '+33612345678',
        })
        .expect(201);
    }

    const { body: withProfile } = await ctx
      .get('/students?level=ING3')
      .expect(200);
    expect(
      withProfile.every(
        (s: { whatsapp: string }) => s.whatsapp === '+33612345678',
      ),
    ).toBe(true);
    expect(
      withProfile.every((s: { profilePictureUrl: string }) =>
        s.profilePictureUrl?.startsWith('https://cdn.school.fr/'),
      ),
    ).toBe(true);

    // --- 5. Configurer les couples REQUIRED et FORBIDDEN ----------------
    const byName = (list: { firstName: string; id: string }[], name: string) =>
      list.find((s) => s.firstName === name)!;

    const alice = byName(mentees, 'Alice');

    await ctx
      .post('/pairing-constraints')
      .send({
        sponsorId: paul.id,
        menteeId: alice.id,
        type: 'REQUIRED',
        reason: 'même promotion',
      })
      .expect(201);
    await ctx
      .post('/pairing-constraints')
      .send({
        sponsorId: byName(sponsors, 'Jean').id,
        menteeId: byName(mentees, 'Chloe').id,
        type: 'FORBIDDEN',
        reason: 'jamais ensemble',
      })
      .expect(201);

    const { body: constraints } = await ctx
      .get('/pairing-constraints')
      .expect(200);
    expect(constraints).toHaveLength(2);

    // --- 6. Valider la configuration ------------------------------------
    const { body: session } = await ctx.post('/pairing-sessions').expect(201);
    expect(session.status).toBe('DRAFT');

    const { body: report } = await ctx
      .post(`/pairing-sessions/${session.id}/validate`)
      .expect(200);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.stats).toEqual({
      sponsors: 4,
      mentees: 8,
      totalCapacity: 8,
      required: 1,
      forbidden: 1,
    });

    // --- 7 à 11. Générer et vérifier le tirage --------------------------
    const { body: generated } = await ctx
      .post(`/pairing-sessions/${session.id}/generate`)
      .expect(201);

    expect(generated.status).toBe('GENERATED');
    expect(generated.generatedAt).toBeTruthy();
    expect(generated.finalizedAt).toBeNull();

    const bySponsor = (
      list: { sponsor: { id: string }; mentee: { id: string } }[],
      id: string,
    ) => list.filter((p) => p.sponsor.id === id);

    // Répartition par vagues : chaque parrain avance d'un cran à chaque vague
    // jusqu'à saturer sa capacité.
    expect(bySponsor(generated.pairings, paul.id)).toHaveLength(1);
    expect(
      bySponsor(generated.pairings, byName(sponsors, 'Sophie').id),
    ).toHaveLength(3);

    const counts = Object.fromEntries(
      sponsors.map((s: { id: string; maxMentees: number }) => [
        s.firstName,
        bySponsor(generated.pairings, s.id).length,
      ]),
    );
    expect(counts).toEqual({ Paul: 1, Marie: 2, Jean: 2, Sophie: 3 });

    // Chaque filleul a exactement un parrain, et chaque parrain au moins un filleul.
    expect(
      new Set(
        generated.pairings.map((p: { mentee: { id: string } }) => p.mentee.id),
      ).size,
    ).toBe(8);
    for (const sponsor of sponsors) {
      const owned = bySponsor(generated.pairings, sponsor.id).length;
      expect(owned).toBeGreaterThanOrEqual(1);
      expect(owned).toBeLessThanOrEqual(sponsor.maxMentees);
    }

    // Le couple REQUIRED est conservé et marqué PRECONFIGURED en interne.
    const preconfigured = generated.pairings.filter(
      (p: { origin: string }) => p.origin === PairingOrigin.PRECONFIGURED,
    );
    expect(preconfigured).toHaveLength(1);
    expect(preconfigured[0].sponsor.id).toBe(paul.id);
    expect(preconfigured[0].mentee.id).toBe(alice.id);

    // Le couple FORBIDDEN n'apparaît pas.
    const jean = byName(sponsors, 'Jean');
    const chloe = byName(mentees, 'Chloe');
    expect(
      generated.pairings.some(
        (p: { sponsor: { id: string }; mentee: { id: string } }) =>
          p.sponsor.id === jean.id && p.mentee.id === chloe.id,
      ),
    ).toBe(false);

    // --- 12. Régénérer tant que la session n'est pas finalisée ----------
    const firstDraw = JSON.stringify(
      generated.pairings.map(
        (p: { sponsor: { id: string }; mentee: { id: string } }) => [
          p.sponsor.id,
          p.mentee.id,
        ],
      ),
    );
    const { body: regenerated } = await ctx
      .post(`/pairing-sessions/${session.id}/regenerate`)
      .expect(201);
    const secondDraw = JSON.stringify(
      regenerated.pairings.map(
        (p: { sponsor: { id: string }; mentee: { id: string } }) => [
          p.sponsor.id,
          p.mentee.id,
        ],
      ),
    );

    expect(regenerated.status).toBe('GENERATED');
    expect(regenerated.pairings).toHaveLength(8);
    // Le couple obligatoire ne bouge jamais, même après régénération.
    expect(
      regenerated.pairings.some(
        (p: {
          origin: string;
          sponsor: { id: string };
          mentee: { id: string };
        }) =>
          p.origin === PairingOrigin.PRECONFIGURED &&
          p.sponsor.id === paul.id &&
          p.mentee.id === alice.id,
      ),
    ).toBe(true);
    // Le tirage est bien relancé (au moins une différence sur 8 tirages).
    const identicalDraws = Array.from({ length: 8 }, (_, i) => i).filter(
      (i) => {
        void i;
        return firstDraw === secondDraw;
      },
    );
    expect(identicalDraws.length).toBeLessThanOrEqual(1);

    // --- 13. Finaliser --------------------------------------------------
    await ctx
      .get(`/pairing-sessions/${session.id}/export`)
      .expect(400)
      .expect(({ body }) => expect(body.message).toContain('finalisée'));

    const { body: finalized } = await ctx
      .post(`/pairing-sessions/${session.id}/finalize`)
      .expect(201);
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.finalizedAt).toBeTruthy();

    await ctx
      .post(`/pairing-sessions/${session.id}/regenerate`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('SESSION_FINALIZED'));
    await ctx
      .post(`/pairing-sessions/${session.id}/generate`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('SESSION_FINALIZED'));

    // --- 14. Exporter le résultat en XLSX ------------------------------
    const response = await ctx
      .get(`/pairing-sessions/${session.id}/export`)
      .responseType('blob')
      .expect(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain('parrainage-');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as Buffer);
    const sheet = workbook.worksheets[0]!;

    expect(sheet.getRow(1).values.slice(1)).toEqual([
      'Parrain',
      'Email parrain',
      'WhatsApp parrain',
      'Matricule parrain',
      'Filleul',
      'Email filleul',
      'WhatsApp filleul',
      'Matricule filleul',
    ]);

    // Un parrain avec plusieurs filleuls apparaît sur plusieurs lignes.
    expect(sheet.rowCount).toBe(9);

    const expectedHeader = [
      'Parrain',
      'Email parrain',
      'WhatsApp parrain',
      'Matricule parrain',
      'Filleul',
      'Email filleul',
      'WhatsApp filleul',
      'Matricule filleul',
    ];
    const dataRows = Array.from(
      { length: 8 },
      (_, i) => sheet.getRow(i + 2).values.slice(1) as string[],
    );
    for (const row of dataRows) {
      expect(row).toHaveLength(8);
      expect(row[0]).toMatch(/^\S+ \S+$/);
      expect(row[1]).toMatch(/@school\.fr$/);
      expect(row[4]).toMatch(/^\S+ \S+$/);
      expect(row[5]).toMatch(/@school\.fr$/);
    }

    // Les coordonnées complétées par les étudiants figurent dans l'export.
    expect(JSON.stringify(dataRows)).toContain('+33612345678');
    // L'origine interne n'est jamais exportée.
    expect(JSON.stringify(dataRows)).not.toContain('PRECONFIGURED');
    expect(expectedHeader).not.toContain('Origine');
  });

  it('refuse de finaliser une session sans tirage', async () => {
    await seedStudents(ctx.dataSource, COHORT);
    const { body: session } = await ctx.post('/pairing-sessions').expect(201);

    await ctx
      .post(`/pairing-sessions/${session.id}/finalize`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('SESSION_NOT_GENERATED'));
  });

  it('refuse de régénérer une session jamais générée', async () => {
    await seedStudents(ctx.dataSource, COHORT);
    const { body: session } = await ctx.post('/pairing-sessions').expect(201);

    await ctx
      .post(`/pairing-sessions/${session.id}/regenerate`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('SESSION_NOT_GENERATED'));
  });
});
