import { PairingErrorCode } from '../src/pairings/pairing-algorithm.service.js';
import { PairingConstraintType } from '../src/pairings/pairing-constraint.entity.js';
import { StudentLevel } from '../src/students/student.entity.js';
import { createTestApp } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';
import type { SeededStudent, StudentSpec } from './utils/fixtures.js';
import { seedStudents } from './utils/fixtures.js';

const SPONSORS: StudentSpec[] = [
  {
    firstName: 'Paul',
    lastName: 'Durand',
    level: StudentLevel.ING4,
    maxMentees: 1,
  },
  {
    firstName: 'Marie',
    lastName: 'Petit',
    level: StudentLevel.ING4,
    maxMentees: 2,
  },
  {
    firstName: 'Jean',
    lastName: 'Martin',
    level: StudentLevel.ING4,
    maxMentees: 2,
  },
  {
    firstName: 'Sophie',
    lastName: 'Robert',
    level: StudentLevel.ING4,
    maxMentees: 3,
  },
];

const MENTEES: StudentSpec[] = [
  { firstName: 'Alice', lastName: 'Bernard', level: StudentLevel.ING3 },
  { firstName: 'Bob', lastName: 'Thomas', level: StudentLevel.ING3 },
  { firstName: 'Chloe', lastName: 'Petit', level: StudentLevel.ING3 },
  { firstName: 'David', lastName: 'Moreau', level: StudentLevel.ING3 },
  { firstName: 'Emma', lastName: 'Laurent', level: StudentLevel.ING3 },
  { firstName: 'Felix', lastName: 'Simon', level: StudentLevel.ING3 },
  { firstName: 'Gabriel', lastName: 'Michel', level: StudentLevel.ING3 },
  { firstName: 'Hina', lastName: 'Lefevre', level: StudentLevel.ING3 },
];

const full = () => [...SPONSORS, ...MENTEES];

describe('Règles métier du parrainage (e2e)', () => {
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

  const newSession = async (): Promise<string> =>
    (await ctx.post('/pairing-sessions').expect(201)).body.id;

  describe('validation avant tirage', () => {
    it("signale l'absence de filleuls", async () => {
      await seedStudents(ctx.dataSource, SPONSORS);
      const session = await newSession();

      const { body } = await ctx
        .post(`/pairing-sessions/${session}/validate`)
        .expect(200);
      expect(body.valid).toBe(false);
      expect(body.issues.map((i: { code: string }) => i.code)).toContain(
        PairingErrorCode.NO_MENTEES,
      );
    });

    it("signale l'absence de parrains", async () => {
      await seedStudents(ctx.dataSource, MENTEES);
      const session = await newSession();

      const { body } = await ctx
        .post(`/pairing-sessions/${session}/validate`)
        .expect(200);
      expect(body.issues.map((i: { code: string }) => i.code)).toContain(
        PairingErrorCode.NO_SPONSORS,
      );
    });

    it('signale un effectif de filleuls insuffisant', async () => {
      await seedStudents(ctx.dataSource, [
        ...SPONSORS,
        { firstName: 'Alice', lastName: 'Bernard', level: StudentLevel.ING3 },
      ]);
      const session = await newSession();

      const { body } = await ctx
        .post(`/pairing-sessions/${session}/validate`)
        .expect(200);
      expect(body.issues.map((i: { code: string }) => i.code)).toContain(
        PairingErrorCode.NOT_ENOUGH_MENTEES,
      );
    });

    it('signale une capacité totale insuffisante', async () => {
      await seedStudents(ctx.dataSource, [
        {
          firstName: 'Paul',
          lastName: 'Durand',
          level: StudentLevel.ING4,
          maxMentees: 1,
        },
        ...MENTEES,
      ]);
      const session = await newSession();

      const { body } = await ctx
        .post(`/pairing-sessions/${session}/validate`)
        .expect(200);
      expect(body.issues.map((i: { code: string }) => i.code)).toContain(
        PairingErrorCode.INSUFFICIENT_TOTAL_CAPACITY,
      );
    });

    it('bloque la génération tant que la configuration est invalide', async () => {
      await seedStudents(ctx.dataSource, SPONSORS);
      const session = await newSession();

      await ctx
        .post(`/pairing-sessions/${session}/generate`)
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.NO_MENTEES),
        );
    });

    it('retourne 404 pour une session inconnue', async () => {
      await ctx
        .post('/pairing-sessions/00000000-0000-0000-0000-000000000000/validate')
        .expect(404);
      await ctx
        .get('/pairing-sessions/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('contraintes de parrainage', () => {
    let students: Record<string, SeededStudent>;

    beforeEach(async () => {
      students = await seedStudents(ctx.dataSource, full());
    });

    it('crée, liste et supprime une contrainte', async () => {
      const { body: created } = await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.REQUIRED,
          reason: 'même promotion',
        })
        .expect(201);

      expect(created).toMatchObject({
        type: 'REQUIRED',
        reason: 'même promotion',
      });

      const { body: all } = await ctx.get('/pairing-constraints').expect(200);
      expect(all).toHaveLength(1);

      const { body: required } = await ctx
        .get('/pairing-constraints?type=REQUIRED')
        .expect(200);
      const { body: forbidden } = await ctx
        .get('/pairing-constraints?type=FORBIDDEN')
        .expect(200);
      expect(required).toHaveLength(1);
      expect(forbidden).toHaveLength(0);

      await ctx.delete(`/pairing-constraints/${created.id}`).expect(204);
      expect(
        (await ctx.get('/pairing-constraints').expect(200)).body,
      ).toHaveLength(0);
    });

    it("refuse un parrain qui n'est pas ING4", async () => {
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Alice Bernard']!.id,
          menteeId: students['Bob Thomas']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.INVALID_SPONSOR),
        );
    });

    it("refuse un filleul qui n'est pas ING3", async () => {
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Marie Petit']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.INVALID_MENTEE),
        );
    });

    it('refuse unRequired qui dépasse la capacité du parrain', async () => {
      // Paul n'accepte qu'un filleul.
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(201);

      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Bob Thomas']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.REQUIRED_CAPACITY_EXCEEDED),
        );
    });

    it('refuse un filleul obligatoire rattaché à deux parrains', async () => {
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(201);

      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Marie Petit']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.DUPLICATE_REQUIRED_MENTEE),
        );
    });

    it("refuse qu'un couple soit à la fois obligatoire et interdit", async () => {
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.FORBIDDEN,
        })
        .expect(201);

      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.REQUIRED,
        })
        .expect(409)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.REQUIRED_PAIRING_CONFLICT),
        );
    });

    it('refuse un doublon exact et un auto-parrainage', async () => {
      const payload = {
        sponsorId: students['Paul Durand']!.id,
        menteeId: students['Alice Bernard']!.id,
        type: PairingConstraintType.FORBIDDEN,
      };
      await ctx.post('/pairing-constraints').send(payload).expect(201);
      await ctx.post('/pairing-constraints').send(payload).expect(409);

      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Paul Durand']!.id,
          type: PairingConstraintType.FORBIDDEN,
        })
        .expect(400);
    });

    it('valide le payload de création de contrainte', async () => {
      await ctx
        .post('/pairing-constraints')
        .send({ sponsorId: 'pas-un-uuid', menteeId: 'idem', type: 'PEUT-ETRE' })
        .expect(400);
    });

    it('applique les interdits lors de la génération', async () => {
      // Filleuls impossibles à placer ailleurs : seul Sophie peut les prendre.
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Paul Durand']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.FORBIDDEN,
        })
        .expect(201);
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Marie Petit']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.FORBIDDEN,
        })
        .expect(201);
      await ctx
        .post('/pairing-constraints')
        .send({
          sponsorId: students['Jean Martin']!.id,
          menteeId: students['Alice Bernard']!.id,
          type: PairingConstraintType.FORBIDDEN,
        })
        .expect(201);

      const session = await newSession();
      const { body } = await ctx
        .post(`/pairing-sessions/${session}/generate`)
        .expect(201);

      expect(
        body.pairings.some(
          (p: { sponsor: { id: string }; mentee: { id: string } }) =>
            p.mentee.id === students['Alice Bernard']!.id &&
            p.sponsor.id !== students['Sophie Robert']!.id,
        ),
      ).toBe(false);
    });

    it('détecte une configuration infaisable avant même de tirer', async () => {
      // Alice est interdite avec les quatre parrains.
      for (const sponsor of [
        'Paul Durand',
        'Marie Petit',
        'Jean Martin',
        'Sophie Robert',
      ]) {
        await ctx
          .post('/pairing-constraints')
          .send({
            sponsorId: students[sponsor]!.id,
            menteeId: students['Alice Bernard']!.id,
            type: PairingConstraintType.FORBIDDEN,
          })
          .expect(201);
      }

      const session = await newSession();
      const { body: report } = await ctx
        .post(`/pairing-sessions/${session}/validate`)
        .expect(200);

      expect(report.valid).toBe(false);
      expect(report.issues.map((i: { code: string }) => i.code)).toContain(
        PairingErrorCode.NO_VALID_PAIRING_FOUND,
      );

      await ctx
        .post(`/pairing-sessions/${session}/generate`)
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe(PairingErrorCode.NO_VALID_PAIRING_FOUND),
        );
    });
  });

  describe('sessions', () => {
    it('liste les sessions et refuse un identifiant mal formé', async () => {
      await seedStudents(ctx.dataSource, full());
      const first = await newSession();
      const second = await newSession();

      const { body } = await ctx.get('/pairing-sessions').expect(200);
      expect(body).toHaveLength(2);
      expect(body.map((s: { id: string }) => s.id)).toEqual(
        expect.arrayContaining([first, second]),
      );

      await ctx.get('/pairing-sessions/pas-un-uuid').expect(400);
    });
  });
});
