import {
  PairingAlgorithmService,
  PairingError,
  PairingErrorCode,
} from './pairing-algorithm.service.js';
import type {
  AlgorithmInput,
  AlgorithmSponsor,
} from './pairing-algorithm.service.js';
import { PairingOrigin } from './pairing.entity.js';

const build = (
  sponsors: [string, number][],
  menteeCount: number,
  overrides: Partial<AlgorithmInput> = {},
): AlgorithmInput => ({
  sponsors: sponsors.map(([id, maxMentees]): AlgorithmSponsor => ({
    id,
    maxMentees,
  })),
  mentees: Array.from({ length: menteeCount }, (_, i) => ({ id: `F${i + 1}` })),
  required: [],
  forbidden: [],
  ...overrides,
});

describe('PairingAlgorithmService', () => {
  let service: PairingAlgorithmService;

  beforeEach(() => {
    service = new PairingAlgorithmService();
  });

  describe('validate', () => {
    it('accepte une configuration cohérente', () => {
      expect(
        service.validate(
          build(
            [
              ['P1', 1],
              ['P2', 2],
              ['P3', 2],
              ['P4', 3],
            ],
            8,
          ),
        ),
      ).toEqual([]);
    });

    it('refuse un tirage sans filleul', () => {
      expect(
        service.validate(build([['P1', 1]], 0)).map((i) => i.code),
      ).toContain(PairingErrorCode.NO_MENTEES);
    });

    it('refuse un tirage sans parrain', () => {
      expect(service.validate(build([], 3)).map((i) => i.code)).toContain(
        PairingErrorCode.NO_SPONSORS,
      );
    });

    it('refuse moins de filleuls que de parrains', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 1],
            ['P2', 1],
            ['P3', 1],
          ],
          2,
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.NOT_ENOUGH_MENTEES,
      );
    });

    it('refuse une capacité totale insuffisante', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 1],
            ['P2', 1],
          ],
          4,
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.INSUFFICIENT_TOTAL_CAPACITY,
      );
    });

    it('refuse un parrain de capacité nulle', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 0],
            ['P2', 5],
          ],
          4,
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.INVALID_CAPACITY,
      );
    });

    it('refuse un REQUIRED dépassant la capacité du parrain', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 1],
            ['P2', 5],
          ],
          6,
          {
            required: [
              { sponsorId: 'P1', menteeId: 'F1' },
              { sponsorId: 'P1', menteeId: 'F2' },
            ],
          },
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.REQUIRED_CAPACITY_EXCEEDED,
      );
    });

    it('refuse un filleul REQUIRED chez deux parrains', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 2],
            ['P2', 2],
          ],
          4,
          {
            required: [
              { sponsorId: 'P1', menteeId: 'F1' },
              { sponsorId: 'P2', menteeId: 'F1' },
            ],
          },
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.DUPLICATE_REQUIRED_MENTEE,
      );
    });

    it('refuse un couple à la fois REQUIRED et FORBIDDEN', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 2],
            ['P2', 2],
          ],
          4,
          {
            required: [{ sponsorId: 'P1', menteeId: 'F1' }],
            forbidden: [{ sponsorId: 'P1', menteeId: 'F1' }],
          },
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.REQUIRED_PAIRING_CONFLICT,
      );
    });

    it('refuse un partenaire inconnu', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 2],
            ['P2', 2],
          ],
          4,
          {
            required: [{ sponsorId: 'P9', menteeId: 'F99' }],
          },
        ),
      );
      const codes = issues.map((i) => i.code);
      expect(codes).toContain(PairingErrorCode.INVALID_SPONSOR);
      expect(codes).toContain(PairingErrorCode.INVALID_MENTEE);
    });

    it('détecte un filleul sans aucun parrain possible', () => {
      const issues = service.validate(
        build(
          [
            ['P1', 1],
            ['P2', 1],
          ],
          2,
          {
            forbidden: [
              { sponsorId: 'P1', menteeId: 'F1' },
              { sponsorId: 'P2', menteeId: 'F1' },
            ],
          },
        ),
      );
      expect(issues.map((i) => i.code)).toContain(
        PairingErrorCode.NO_VALID_PAIRING_FOUND,
      );
    });
  });

  describe('generate', () => {
    it('répartit par vagues selon les capacités (1, 2, 2, 3 pour 8 filleuls)', () => {
      const result = service.generate(
        build(
          [
            ['P1', 1],
            ['P2', 2],
            ['P3', 2],
            ['P4', 3],
          ],
          8,
        ),
      );

      const counts: Record<string, number> = {};
      for (const assignment of result) {
        counts[assignment.sponsorId] = (counts[assignment.sponsorId] ?? 0) + 1;
      }
      expect(counts).toEqual({ P1: 1, P2: 2, P3: 2, P4: 3 });
    });

    it('rattache tous les filleuls et donne au moins un filleul à chaque parrain', () => {
      const sponsors: [string, number][] = [
        ['P1', 3],
        ['P2', 3],
        ['P3', 2],
        ['P4', 1],
        ['P5', 4],
      ];
      const result = service.generate(build(sponsors, 13));

      expect(new Set(result.map((a) => a.menteeId)).size).toBe(13);
      for (const [id, maxMentees] of sponsors) {
        const owned = result.filter((a) => a.sponsorId === id).length;
        expect(owned).toBeGreaterThanOrEqual(1);
        expect(owned).toBeLessThanOrEqual(maxMentees);
      }
    });

    it('applique les couples préconfigurés en PREMIER et les fige', () => {
      const result = service.generate(
        build(
          [
            ['P1', 2],
            ['P2', 2],
            ['P3', 2],
            ['P4', 2],
            ['P5', 2],
          ],
          10,
          {
            required: [
              { sponsorId: 'P1', menteeId: 'F4' },
              { sponsorId: 'P3', menteeId: 'F9' },
            ],
          },
        ),
      );

      const preconfigured = result.filter(
        (a) => a.origin === PairingOrigin.PRECONFIGURED,
      );
      expect(preconfigured).toHaveLength(2);
      expect(preconfigured).toEqual(
        expect.arrayContaining([
          {
            sponsorId: 'P1',
            menteeId: 'F4',
            origin: PairingOrigin.PRECONFIGURED,
          },
          {
            sponsorId: 'P3',
            menteeId: 'F9',
            origin: PairingOrigin.PRECONFIGURED,
          },
        ]),
      );
      expect(result).toHaveLength(10);
    });

    it('compte les couples préconfigurés dans la capacité du parrain', () => {
      // P1 est saturé par son obligatoire : il ne peut rien recevoir d'autre.
      const result = service.generate(
        build(
          [
            ['P1', 1],
            ['P2', 2],
            ['P3', 2],
            ['P4', 3],
          ],
          8,
          {
            required: [{ sponsorId: 'P1', menteeId: 'F4' }],
          },
        ),
      );
      expect(result.filter((a) => a.sponsorId === 'P1')).toHaveLength(1);
      expect(result.filter((a) => a.sponsorId === 'P1')[0]!.menteeId).toBe(
        'F4',
      );
    });

    it('respecte tous les couples interdits', () => {
      // F2 et F3 sont cantonnés à P3 et P4, ce qui force un vrai retour sur trace.
      const forbidden = [
        { sponsorId: 'P1', menteeId: 'F2' },
        { sponsorId: 'P1', menteeId: 'F3' },
        { sponsorId: 'P2', menteeId: 'F2' },
        { sponsorId: 'P2', menteeId: 'F3' },
      ];

      for (let run = 0; run < 50; run += 1) {
        const result = service.generate(
          build(
            [
              ['P1', 2],
              ['P2', 2],
              ['P3', 2],
              ['P4', 2],
            ],
            8,
            { forbidden },
          ),
        );
        for (const assignment of result) {
          expect(forbidden).not.toContainEqual({
            sponsorId: assignment.sponsorId,
            menteeId: assignment.menteeId,
          });
        }
        expect(result).toHaveLength(8);
        expect(new Set(result.map((a) => a.menteeId)).size).toBe(8);
      }
    });

    it('trouve une solution là où un mélange naïf échoue', () => {
      // F1 et F2 ne peuvent aller que chez P3, qui a exactement 2 places.
      const forbidden = [
        { sponsorId: 'P1', menteeId: 'F1' },
        { sponsorId: 'P2', menteeId: 'F1' },
        { sponsorId: 'P1', menteeId: 'F2' },
        { sponsorId: 'P2', menteeId: 'F2' },
      ];
      const result = service.generate(
        build(
          [
            ['P1', 2],
            ['P2', 2],
            ['P3', 2],
            ['P4', 2],
          ],
          8,
          { forbidden },
        ),
      );

      expect(
        result.filter((a) => a.menteeId === 'F1' || a.menteeId === 'F2'),
      ).toHaveLength(2);
      expect(result).toHaveLength(8);
    });

    it('lève NO_VALID_PAIRING_FOUND quand aucun tirage n est possible', () => {
      const input = build(
        [
          ['P1', 1],
          ['P2', 1],
        ],
        2,
        {
          forbidden: [
            { sponsorId: 'P1', menteeId: 'F1' },
            { sponsorId: 'P2', menteeId: 'F1' },
          ],
        },
      );
      expect(() => service.generate(input)).toThrow(PairingError);
      try {
        service.generate(input);
      } catch (error) {
        expect((error as PairingError).code).toBe(
          PairingErrorCode.NO_VALID_PAIRING_FOUND,
        );
      }
    });

    it('lève la première erreur de validation', () => {
      try {
        service.generate(
          build(
            [
              ['P1', 1],
              ['P2', 1],
              ['P3', 1],
            ],
            2,
          ),
        );
        expect.unreachable('generate doit lever');
      } catch (error) {
        expect((error as PairingError).code).toBe(
          PairingErrorCode.NOT_ENOUGH_MENTEES,
        );
      }
    });

    it('produit un tirage différent à chaque exécution', () => {
      const input = build(
        [
          ['P1', 3],
          ['P2', 3],
          ['P3', 3],
          ['P4', 3],
        ],
        12,
      );
      const signature = () =>
        service
          .generate(input)
          .map((a) => `${a.sponsorId}>${a.menteeId}`)
          .sort()
          .join(',');

      const runs = new Set(Array.from({ length: 15 }, signature));
      expect(runs.size).toBeGreaterThan(1);
    });

    it('gère un grand effectif', () => {
      const sponsors: [string, number][] = Array.from(
        { length: 20 },
        (_, i) => [`P${i + 1}`, 3],
      );
      const result = service.generate(build(sponsors, 60));

      expect(result).toHaveLength(60);
      expect(new Set(result.map((a) => a.menteeId)).size).toBe(60);
      for (const [id, maxMentees] of sponsors) {
        const owned = result.filter((a) => a.sponsorId === id).length;
        expect(owned).toBeGreaterThanOrEqual(1);
        expect(owned).toBeLessThanOrEqual(maxMentees);
      }
    });
  });
});
