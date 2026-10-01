import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PairingOrigin } from './pairing.entity.js';

export enum PairingErrorCode {
  NO_MENTEES = 'NO_MENTEES',
  NO_SPONSORS = 'NO_SPONSORS',
  NOT_ENOUGH_MENTEES = 'NOT_ENOUGH_MENTEES',
  INVALID_CAPACITY = 'INVALID_CAPACITY',
  INSUFFICIENT_TOTAL_CAPACITY = 'INSUFFICIENT_TOTAL_CAPACITY',
  INVALID_SPONSOR = 'INVALID_SPONSOR',
  INVALID_MENTEE = 'INVALID_MENTEE',
  DUPLICATE_REQUIRED_MENTEE = 'DUPLICATE_REQUIRED_MENTEE',
  REQUIRED_CAPACITY_EXCEEDED = 'REQUIRED_CAPACITY_EXCEEDED',
  REQUIRED_PAIRING_CONFLICT = 'REQUIRED_PAIRING_CONFLICT',
  NO_VALID_PAIRING_FOUND = 'NO_VALID_PAIRING_FOUND',
  SESSION_FINALIZED = 'SESSION_FINALIZED',
  SESSION_NOT_GENERATED = 'SESSION_NOT_GENERATED',
}

export interface PairingIssue {
  code: PairingErrorCode;
  message: string;
}

export class PairingError extends Error {
  constructor(
    readonly code: PairingErrorCode,
    message: string,
    readonly issues: PairingIssue[] = [],
  ) {
    super(message);
    this.name = 'PairingError';
  }
}

export interface AlgorithmSponsor {
  id: string;
  maxMentees: number;
}

export interface AlgorithmMentee {
  id: string;
}

export interface AlgorithmPair {
  sponsorId: string;
  menteeId: string;
}

export interface AlgorithmInput {
  sponsors: AlgorithmSponsor[];
  mentees: AlgorithmMentee[];
  required: AlgorithmPair[];
  forbidden: AlgorithmPair[];
}

export interface AlgorithmAssignment extends AlgorithmPair {
  origin: PairingOrigin;
}

/**
 * Distribution des filleuls par vagues avec retour sur trace.
 *
 * Le tirage est déterministe dans sa forme : les couples préconfigurés
 * (REQUIRED) sont posés en premier et comptent déjà dans la capacité du parrain,
 * puis les filleuls restants sont distribués vague par vague (target = 1, 2, 3...).
 * Un parrain n'entre dans une vague que si `count < target && count < maxMentees`,
 * ce qui garantit qu'aucun parrain n'est servi avant qu'un autre ne l'ait été.
 *
 * À l'intérieur d'une vague, un parcours en profondeur avec retour sur trace
 * explore les candidates interdites en dernier : un mélange naïf peut se
 * bloquer alors qu'une solution existe.
 */
@Injectable()
export class PairingAlgorithmService {
  /** Garde-fou : évite une recherche exponentielle sur un jeu de données aberrant. */
  private static readonly MAX_NODES = 50_000;

  validate(input: AlgorithmInput): PairingIssue[] {
    const issues: PairingIssue[] = [];
    const push = (code: PairingErrorCode, message: string) =>
      issues.push({ code, message });

    const { sponsors, mentees, required, forbidden } = input;
    const sponsorIds = new Set(sponsors.map((s) => s.id));
    const menteeIds = new Set(mentees.map((m) => m.id));

    if (mentees.length === 0) {
      push(
        PairingErrorCode.NO_MENTEES,
        "Aucun étudiant ING3 (filleul) n'est importé",
      );
    }
    if (sponsors.length === 0) {
      push(
        PairingErrorCode.NO_SPONSORS,
        "Aucun étudiant ING4 (parrain) n'est importé",
      );
    }

    // Tous les parrains doivent avoir au moins un filleul.
    if (mentees.length < sponsors.length) {
      push(
        PairingErrorCode.NOT_ENOUGH_MENTEES,
        `Il faut au moins autant de filleuls (${mentees.length}) que de parrains (${sponsors.length})`,
      );
    }

    for (const sponsor of sponsors) {
      if (sponsor.maxMentees < 1) {
        push(
          PairingErrorCode.INVALID_CAPACITY,
          `Le parrain ${sponsor.id} doit avoir une capacité maxMentees >= 1`,
        );
      }
    }

    const totalCapacity = sponsors.reduce((sum, s) => sum + s.maxMentees, 0);
    if (totalCapacity < mentees.length) {
      push(
        PairingErrorCode.INSUFFICIENT_TOTAL_CAPACITY,
        `Capacité totale insuffisante : ${totalCapacity} pour ${mentees.length} filleul(s)`,
      );
    }

    for (const pair of [...required, ...forbidden]) {
      if (!sponsorIds.has(pair.sponsorId)) {
        push(
          PairingErrorCode.INVALID_SPONSOR,
          `Le parrain ${pair.sponsorId} n'est pas un ING4`,
        );
      }
      if (!menteeIds.has(pair.menteeId)) {
        push(
          PairingErrorCode.INVALID_MENTEE,
          `Le filleul ${pair.menteeId} n'est pas un ING3`,
        );
      }
    }

    const requiredByMentee = new Map<string, number>();
    const requiredBySponsor = new Map<string, number>();
    for (const pair of required) {
      requiredByMentee.set(
        pair.menteeId,
        (requiredByMentee.get(pair.menteeId) ?? 0) + 1,
      );
      requiredBySponsor.set(
        pair.sponsorId,
        (requiredBySponsor.get(pair.sponsorId) ?? 0) + 1,
      );
    }

    for (const [menteeId, count] of requiredByMentee) {
      if (count > 1) {
        push(
          PairingErrorCode.DUPLICATE_REQUIRED_MENTEE,
          `Le filleul ${menteeId} est rattaché à ${count} parrains obligatoires`,
        );
      }
    }

    for (const sponsor of sponsors) {
      const count = requiredBySponsor.get(sponsor.id) ?? 0;
      if (count > sponsor.maxMentees) {
        push(
          PairingErrorCode.REQUIRED_CAPACITY_EXCEEDED,
          `Le parrain ${sponsor.id} a ${count} parrainage(s) obligatoire(s) pour une capacité de ${sponsor.maxMentees}`,
        );
      }
    }

    const forbiddenKeys = new Set(
      forbidden.map((p) => this.key(p.sponsorId, p.menteeId)),
    );
    for (const pair of required) {
      if (forbiddenKeys.has(this.key(pair.sponsorId, pair.menteeId))) {
        push(
          PairingErrorCode.REQUIRED_PAIRING_CONFLICT,
          `Le couple ${pair.sponsorId} / ${pair.menteeId} est à la fois obligatoire et interdit`,
        );
      }
    }

    // Un filleul qui n'a plus aucun parrain possible rend le tirage impossible.
    const pinnedSponsor = new Map(
      required.map((pair) => [pair.menteeId, pair.sponsorId]),
    );
    const requiredCountBySponsor = new Map<string, number>();
    for (const pair of required) {
      requiredCountBySponsor.set(
        pair.sponsorId,
        (requiredCountBySponsor.get(pair.sponsorId) ?? 0) + 1,
      );
    }

    for (const mentee of mentees) {
      const pinned = pinnedSponsor.get(mentee.id);
      const reachable = sponsors.some((sponsor) => {
        if (forbiddenKeys.has(this.key(sponsor.id, mentee.id))) return false;
        const committed = requiredCountBySponsor.get(sponsor.id) ?? 0;
        // La place du filleul lui-même n'est pas encore consommée.
        const free =
          sponsor.maxMentees -
          (pinned === sponsor.id ? committed - 1 : committed);
        return free >= 0;
      });
      if (!reachable) {
        push(
          PairingErrorCode.NO_VALID_PAIRING_FOUND,
          pinned
            ? `Le filleul ${mentee.id} est obligatoire chez ${pinned} mais ne peut pas y être rattaché`
            : `Le filleul ${mentee.id} n'a plus aucun parrain autorisé disposant d'une place`,
        );
      }
    }

    return issues;
  }

  generate(input: AlgorithmInput): AlgorithmAssignment[] {
    const issues = this.validate(input);
    if (issues.length > 0) {
      throw new PairingError(issues[0]!.code, issues[0]!.message, issues);
    }

    const { sponsors, mentees, required } = input;
    const forbidden = new Set(
      input.forbidden.map((p) => this.key(p.sponsorId, p.menteeId)),
    );
    const maxById = new Map(sponsors.map((s) => [s.id, s.maxMentees]));
    const counts = new Map<string, number>(sponsors.map((s) => [s.id, 0]));
    const taken = new Set<string>();

    const assignments: AlgorithmAssignment[] = [];

    // 1. Les couples préconfigurés sont posés en premier et consomment de la capacité.
    for (const pair of required) {
      assignments.push({ ...pair, origin: PairingOrigin.PRECONFIGURED });
      counts.set(pair.sponsorId, counts.get(pair.sponsorId)! + 1);
      taken.add(pair.menteeId);
    }

    let pool = mentees.filter((m) => !taken.has(m.id));
    const budget = { nodes: 0 };

    // 2. Distribution par vagues.
    for (let target = 1; pool.length > 0; target += 1) {
      const eligible = sponsors.filter(
        (s) => counts.get(s.id)! < target && counts.get(s.id)! < s.maxMentees,
      );
      if (eligible.length === 0) break;

      const wave = this.solveWave({
        index: 0,
        queue: this.shuffle(eligible).slice(0, pool.length),
        pool,
        counts,
        maxById,
        taken,
        forbidden,
        budget,
        chosen: [],
      });

      if (wave === null) {
        throw new PairingError(
          PairingErrorCode.NO_VALID_PAIRING_FOUND,
          `Aucune répartition valide n'a pu être trouvée pour la vague ${target} ` +
            `en respectant les couples interdits et les capacités maximales`,
        );
      }

      // solveWave laisse `counts` et `taken` à jour en cas de succès :
      // il ne reste qu'à consigner les couples de la vague.
      for (const pair of wave) {
        assignments.push({ ...pair, origin: PairingOrigin.RANDOM });
      }
      pool = pool.filter((m) => !taken.has(m.id));
    }

    if (pool.length > 0) {
      throw new PairingError(
        PairingErrorCode.NO_VALID_PAIRING_FOUND,
        `${pool.length} filleul(s) n'ont pas pu être rattachés à un parrain`,
      );
    }

    return assignments;
  }

  /**
   * Remplit une vague. En cas de succès, les incréments provisoires de
   * `counts` / `taken` sont conservés (ils constituent l'attribution) ; en cas
   * d'échec, chaque tentative est annulée.
   */
  private solveWave(state: {
    index: number;
    queue: AlgorithmSponsor[];
    pool: AlgorithmMentee[];
    counts: Map<string, number>;
    maxById: Map<string, number>;
    taken: Set<string>;
    forbidden: Set<string>;
    budget: { nodes: number };
    chosen: AlgorithmPair[];
  }): AlgorithmPair[] | null {
    if (state.index >= state.queue.length) return state.chosen;
    if (state.budget.nodes++ > PairingAlgorithmService.MAX_NODES) return null;

    const sponsor = state.queue[state.index]!;

    for (const mentee of this.shuffle(state.pool)) {
      if (state.taken.has(mentee.id)) continue;
      if (state.forbidden.has(this.key(sponsor.id, mentee.id))) continue;

      state.taken.add(mentee.id);
      state.counts.set(sponsor.id, state.counts.get(sponsor.id)! + 1);
      state.chosen.push({ sponsorId: sponsor.id, menteeId: mentee.id });

      if (
        this.isFeasible(state) &&
        this.solveWave({ ...state, index: state.index + 1 }) !== null
      ) {
        return state.chosen;
      }

      state.chosen.pop();
      state.counts.set(sponsor.id, state.counts.get(sponsor.id)! - 1);
      state.taken.delete(mentee.id);
    }

    return null;
  }

  /**
   * Élagage : la vague courante doit rester remplissable et les vagues
   * suivantes doivent encore avoir assez de capacité et des solutions
   * autorisées pour chaque filleul restant.
   */
  private isFeasible(state: {
    pool: AlgorithmMentee[];
    counts: Map<string, number>;
    maxById: Map<string, number>;
    taken: Set<string>;
    forbidden: Set<string>;
  }): boolean {
    const remaining = state.pool.filter((m) => !state.taken.has(m.id));
    if (remaining.length === 0) return true;

    const open: string[] = [];
    let capacity = 0;
    for (const [sponsorId, count] of state.counts) {
      const free = state.maxById.get(sponsorId)! - count;
      if (free > 0) {
        capacity += free;
        open.push(sponsorId);
      }
    }
    if (remaining.length > capacity) return false;

    return remaining.every((mentee) =>
      open.some(
        (sponsorId) => !state.forbidden.has(this.key(sponsorId, mentee.id)),
      ),
    );
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  private key(sponsorId: string, menteeId: string): string {
    return `${sponsorId}|${menteeId}`;
  }
}
