import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Student, StudentLevel } from '../students/student.entity.js';
import { StudentsService } from '../students/students.service.js';
import { CreatePairingConstraintDto } from './dto/create-pairing-constraint.dto.js';
import type {
  PairingSessionViewDto,
  PairingViewDto,
  StudentRefDto,
} from './dto/pairing-session-view.dto.js';
import { QueryPairingConstraintsDto } from './dto/query-pairing-constraints.dto.js';
import {
  PairingConstraint,
  PairingConstraintType,
} from './pairing-constraint.entity.js';
import { PairingOrigin, Pairing } from './pairing.entity.js';
import {
  PairingSession,
  PairingSessionStatus,
} from './pairing-session.entity.js';
import {
  type AlgorithmInput,
  PairingAlgorithmService,
  PairingError,
  PairingErrorCode,
  type PairingIssue,
} from './pairing-algorithm.service.js';

export interface PairingValidationReport {
  valid: boolean;
  issues: PairingIssue[];
  stats: {
    sponsors: number;
    mentees: number;
    totalCapacity: number;
    required: number;
    forbidden: number;
  };
}

@Injectable()
export class PairingsService {
  private readonly logger = new Logger(PairingsService.name);

  constructor(
    @InjectRepository(PairingSession)
    private readonly sessions: Repository<PairingSession>,
    @InjectRepository(Pairing)
    private readonly pairings: Repository<Pairing>,
    @InjectRepository(PairingConstraint)
    private readonly constraints: Repository<PairingConstraint>,
    private readonly studentsService: StudentsService,
    private readonly algorithm: PairingAlgorithmService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- sessions

  findSessions(): Promise<PairingSession[]> {
    return this.sessions.find({ order: { createdAt: 'DESC' } });
  }

  findSessionOrFail(id: string): Promise<PairingSession> {
    return this.sessions.findOne({ where: { id } }).then((session) => {
      if (!session) {
        throw new NotFoundException(
          `Session de parrainage introuvable : ${id}`,
        );
      }
      return session;
    });
  }

  createSession(): Promise<PairingSession> {
    return this.sessions.save(
      this.sessions.create({ status: PairingSessionStatus.DRAFT }),
    );
  }

  async getSession(id: string): Promise<PairingSessionViewDto> {
    const session = await this.findSessionOrFail(id);
    const pairings = await this.pairings.find({ where: { sessionId: id } });

    const students = await this.studentsService.findAll({});
    const byId = new Map(students.map((s) => [s.id, s]));

    const views: PairingViewDto[] = pairings
      .map((pairing) => {
        const sponsor = byId.get(pairing.sponsorId);
        const mentee = byId.get(pairing.menteeId);
        if (!sponsor || !mentee) return null;
        return {
          id: pairing.id,
          origin: pairing.origin,
          sponsor: this.toRef(sponsor),
          mentee: this.toRef(mentee),
        };
      })
      .filter((view): view is PairingViewDto => view !== null);

    views.sort(
      (a, b) =>
        `${a.sponsor.lastName}${a.sponsor.firstName}`.localeCompare(
          `${b.sponsor.lastName}${b.sponsor.firstName}`,
        ) ||
        `${a.mentee.lastName}${a.mentee.firstName}`.localeCompare(
          `${b.mentee.lastName}${b.mentee.firstName}`,
        ),
    );

    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      generatedAt: session.generatedAt,
      finalizedAt: session.finalizedAt,
      pairings: views,
    };
  }

  async validate(sessionId: string): Promise<PairingValidationReport> {
    await this.findSessionOrFail(sessionId);
    const input = await this.buildInput();
    return this.toReport(input, this.algorithm.validate(input));
  }

  /** Génère un premier tirage. */
  async generate(sessionId: string): Promise<PairingSessionViewDto> {
    const session = await this.findSessionOrFail(sessionId);
    if (session.status === PairingSessionStatus.FINALIZED) {
      throw new BadRequestException({
        code: PairingErrorCode.SESSION_FINALIZED,
        message: 'Une session finalisée ne peut plus être générée',
      });
    }
    return this.runGeneration(session);
  }

  /** Regénère un tirage existant tant que la session n'est pas finalisée. */
  async regenerate(sessionId: string): Promise<PairingSessionViewDto> {
    const session = await this.findSessionOrFail(sessionId);
    if (session.status === PairingSessionStatus.FINALIZED) {
      throw new BadRequestException({
        code: PairingErrorCode.SESSION_FINALIZED,
        message: 'Une session finalisée ne peut plus être régénérée',
      });
    }
    if (session.status === PairingSessionStatus.DRAFT) {
      throw new BadRequestException({
        code: PairingErrorCode.SESSION_NOT_GENERATED,
        message: 'La session ne possède aucun tirage à régénérer',
      });
    }
    return this.runGeneration(session);
  }

  async finalize(sessionId: string): Promise<PairingSessionViewDto> {
    const session = await this.findSessionOrFail(sessionId);
    if (session.status === PairingSessionStatus.FINALIZED) {
      return this.getSession(sessionId);
    }
    if (session.status === PairingSessionStatus.DRAFT) {
      throw new BadRequestException({
        code: PairingErrorCode.SESSION_NOT_GENERATED,
        message: 'Impossible de finaliser une session sans tirage',
      });
    }

    await this.sessions.update(
      { id: sessionId },
      { status: PairingSessionStatus.FINALIZED, finalizedAt: new Date() },
    );
    this.logger.log(`Session ${sessionId} finalisée`);
    return this.getSession(sessionId);
  }

  // ------------------------------------------------------------- constraints

  findConstraints(
    query: QueryPairingConstraintsDto,
  ): Promise<PairingConstraint[]> {
    return this.constraints.find({
      where: query.type ? { type: query.type } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async createConstraint(
    dto: CreatePairingConstraintDto,
  ): Promise<PairingConstraint> {
    const { sponsorId, menteeId, type, reason } = dto;
    if (sponsorId === menteeId) {
      throw new BadRequestException(
        'Un étudiant ne peut pas être son propre parrain',
      );
    }

    const [sponsor, mentee] = await Promise.all([
      this.studentsService.findOne(sponsorId),
      this.studentsService.findOne(menteeId),
    ]);
    if (!sponsor || sponsor.level !== StudentLevel.ING4) {
      throw new BadRequestException({
        code: PairingErrorCode.INVALID_SPONSOR,
        message: 'Le parrain doit être un ING4',
      });
    }
    if (!mentee || mentee.level !== StudentLevel.ING3) {
      throw new BadRequestException({
        code: PairingErrorCode.INVALID_MENTEE,
        message: 'Le filleul doit être un ING3',
      });
    }

    const existing = await this.constraints.findOne({
      where: { sponsorId, menteeId },
    });
    if (existing) {
      if (existing.type === type) {
        throw new ConflictException('Cette contrainte existe déjà');
      }
      throw new ConflictException({
        code: PairingErrorCode.REQUIRED_PAIRING_CONFLICT,
        message: 'Le couple est déjà enregistré avec le type opposé',
      });
    }

    if (type === PairingConstraintType.REQUIRED) {
      const assigned = await this.constraints.count({
        where: { sponsorId, type: PairingConstraintType.REQUIRED },
      });
      if (assigned + 1 > (sponsor.maxMentees ?? 0)) {
        throw new BadRequestException({
          code: PairingErrorCode.REQUIRED_CAPACITY_EXCEEDED,
          message: `Le parrain ${sponsor.firstName} ${sponsor.lastName} a déjà atteint sa capacité (${sponsor.maxMentees})`,
        });
      }
      const alreadyRequired = await this.constraints.count({
        where: { menteeId, type: PairingConstraintType.REQUIRED },
      });
      if (alreadyRequired > 0) {
        throw new BadRequestException({
          code: PairingErrorCode.DUPLICATE_REQUIRED_MENTEE,
          message:
            'Ce filleul est déjà rattaché à un autre parrain obligatoire',
        });
      }
    }

    return this.constraints.save(
      this.constraints.create({
        sponsorId,
        menteeId,
        type,
        reason: reason ?? null,
      }),
    );
  }

  async deleteConstraint(id: string): Promise<void> {
    const result = await this.constraints.delete({ id });
    if (!result.affected) {
      throw new BadRequestException(`Contrainte introuvable : ${id}`);
    }
  }

  // ----------------------------------------------------------------- interne

  private async runGeneration(
    session: PairingSession,
  ): Promise<PairingSessionViewDto> {
    const input = await this.buildInput();
    const issues = this.algorithm.validate(input);
    if (issues.length > 0) {
      throw new BadRequestException({
        code: issues[0]!.code,
        message: issues[0]!.message,
        issues,
      });
    }

    let assignments;
    try {
      assignments = this.algorithm.generate(input);
    } catch (error) {
      if (error instanceof PairingError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
    const now = new Date();

    // Toute la génération est atomique : un échec ne laisse pas de partially paired.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Pairing, { sessionId: session.id });
      await manager.save(
        Pairing,
        assignments.map((assignment) =>
          manager.create(Pairing, {
            sessionId: session.id,
            sponsorId: assignment.sponsorId,
            menteeId: assignment.menteeId,
            origin: assignment.origin,
          }),
        ),
      );
      await manager.update(
        PairingSession,
        { id: session.id },
        {
          status: PairingSessionStatus.GENERATED,
          generatedAt: now,
          finalizedAt: null,
        },
      );
    });

    this.logger.log(
      `Session ${session.id} : ${assignments.length} parrainage(s) généré(s) ` +
        `(${assignments.filter((a) => a.origin === PairingOrigin.PRECONFIGURED).length} préconfiguré(s))`,
    );
    return this.getSession(session.id);
  }

  private async buildInput(): Promise<AlgorithmInput> {
    const [sponsors, mentees, constraints] = await Promise.all([
      this.studentsService.findAllByLevel(StudentLevel.ING4),
      this.studentsService.findAllByLevel(StudentLevel.ING3),
      this.constraints.find(),
    ]);

    return {
      sponsors: sponsors.map((s) => ({
        id: s.id,
        maxMentees: s.maxMentees ?? 0,
      })),
      mentees: mentees.map((m) => ({ id: m.id })),
      required: constraints
        .filter((c) => c.type === PairingConstraintType.REQUIRED)
        .map((c) => ({ sponsorId: c.sponsorId, menteeId: c.menteeId })),
      forbidden: constraints
        .filter((c) => c.type === PairingConstraintType.FORBIDDEN)
        .map((c) => ({ sponsorId: c.sponsorId, menteeId: c.menteeId })),
    };
  }

  private toReport(
    input: AlgorithmInput,
    issues: PairingIssue[],
  ): PairingValidationReport {
    return {
      valid: issues.length === 0,
      issues,
      stats: {
        sponsors: input.sponsors.length,
        mentees: input.mentees.length,
        totalCapacity: input.sponsors.reduce((sum, s) => sum + s.maxMentees, 0),
        required: input.required.length,
        forbidden: input.forbidden.length,
      },
    };
  }

  private toRef(student: Student): StudentRefDto {
    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      matricule: student.matricule,
      whatsapp: student.whatsapp,
      profilePictureUrl: student.profilePictureUrl,
    };
  }
}
