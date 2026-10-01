import { createHash, randomBytes } from 'node:crypto';
import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { PROFILE_INVITATION_SUBJECT, StudentMailService } from '../mail/student-mail.service.js';
import type { BulkSendReport } from '../mail/interfaces/mail-recipients.interfaces.js';
import { Student } from '../students/student.entity.js';
import { StudentsService } from '../students/students.service.js';
import { InvitationStatus, ProfileInvitation } from './invitation.entity.js';
import { CompleteProfileDto } from './dto/complete-profile.dto.js';
import type { InvitationViewDto } from './dto/invitation-view.dto.js';

export interface InvitationPreview {
  firstName: string;
  expiresAt: Date | null;
}

export interface InvitationResult {
  invitation: InvitationViewDto;
  email: BulkSendReport;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @InjectRepository(ProfileInvitation)
    private readonly invitations: Repository<ProfileInvitation>,
    private readonly dataSource: DataSource,
    private readonly studentsService: StudentsService,
    private readonly mailService: MailService,
    private readonly studentMailService: StudentMailService,
    private readonly config: ConfigService,
  ) {}

  /** Crée une invitation et envoie l'email correspondant. */
  async create(studentId: string): Promise<InvitationResult> {
    const student = await this.studentsService.findOneOrFail(studentId);
    const { token, invitation } = await this.issue(student);
    return {
      invitation: this.toView(invitation),
      email: await this.dispatch(
        student.firstName,
        student.email,
        token,
        invitation.expiresAt,
      ),
    };
  }

  /**
   * Invitation groupée : annule les liens en attente des étudiants visés,
   * émet un nouveau lien pour chacun et envoie tous les mails en un seul lot.
   * Sans liste, cible les étudiants dont le profil est incomplet.
   */
  async createBulk(studentIds?: string[]): Promise<BulkSendReport> {
    const studentsRepo = this.dataSource.getRepository(Student);
    const students = studentIds?.length
      ? await studentsRepo.findBy({ id: In(studentIds) })
      : await studentsRepo.find({
          where: [{ whatsapp: IsNull() }, { profilePictureUrl: IsNull() }],
        });
    if (!students.length) return { total: 0, sent: 0, failed: [] };

    await this.invitations.update(
      { studentId: In(students.map((s) => s.id)), status: InvitationStatus.PENDING },
      { status: InvitationStatus.CANCELLED },
    );

    const recipients = [];
    for (const student of students) {
      const { token, invitation } = await this.issue(student);
      recipients.push({
        prenom: student.firstName,
        email: student.email,
        token,
        expiresAt: invitation.expiresAt ?? new Date(),
      });
    }
    return this.studentMailService.sendProfileFormInvitations(recipients);
  }

  /**
   * Suivi des invitations, étudiant par étudiant : dernière invitation émise
   * (état, dates) et dernier événement de livraison connu chez Brevo.
   */
  async overview() {
    const [students, invitations, deliveries] = await Promise.all([
      this.dataSource.getRepository(Student).find(),
      this.invitations.find({ order: { sentAt: 'DESC' } }),
      this.mailService.recentDeliveries(PROFILE_INVITATION_SUBJECT),
    ]);
    const lastByStudent = new Map<string, ProfileInvitation>();
    for (const inv of invitations) if (!lastByStudent.has(inv.studentId)) lastByStudent.set(inv.studentId, inv);

    return {
      deliveryTracking: deliveries !== null,
      students: students.map((s) => {
        const inv = lastByStudent.get(s.id);
        return {
          studentId: s.id,
          invitation: inv
            ? { status: inv.status, sentAt: inv.sentAt, expiresAt: inv.expiresAt, usedAt: inv.usedAt }
            : null,
          delivery: deliveries?.get(s.email.toLowerCase()) ?? null,
        };
      }),
    };
  }

  /** Annule les invitations en attente et en émet une nouvelle. */
  async resend(studentId: string): Promise<InvitationResult> {
    const student = await this.studentsService.findOneOrFail(studentId);

    await this.invitations.update(
      { studentId, status: InvitationStatus.PENDING },
      { status: InvitationStatus.CANCELLED },
    );

    const { token, invitation } = await this.issue(student);
    return {
      invitation: this.toView(invitation),
      email: await this.dispatch(
        student.firstName,
        student.email,
        token,
        invitation.expiresAt,
      ),
    };
  }

  /**
   * Vérifie la validité d'un token et retourne le strict nécessaire
   * pour afficher le formulaire.
   */
  async verify(token: string): Promise<InvitationPreview> {
    const invitation = await this.resolve(token);
    const student = await this.studentsService.findOneOrFail(
      invitation.studentId,
    );
    return { firstName: student.firstName, expiresAt: invitation.expiresAt };
  }

  /** Consomme le token et enregistre photo + WhatsApp. */
  async complete(dto: CompleteProfileDto): Promise<InvitationPreview> {
    const invitation = await this.resolve(dto.token);
    const student = await this.studentsService.findOneOrFail(
      invitation.studentId,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProfileInvitation).update(
        { id: invitation.id },
        {
          status: InvitationStatus.USED,
          usedAt: new Date(),
        },
      );
      await manager.update(
        Student,
        { id: student.id },
        {
          profilePictureUrl: dto.profilePictureUrl,
          whatsapp: dto.whatsapp,
        },
      );
    });

    this.logger.log(`Profil complété par ${student.email}`);
    return { firstName: student.firstName, expiresAt: invitation.expiresAt };
  }

  private async issue(student: { id: string }) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const { profileInvitationExpirationHours, profileInvitationDeadline } =
      this.config.getOrThrow('app');

    const invitation = await this.invitations.save(
      this.invitations.create({
        studentId: student.id,
        tokenHash: this.hash(token),
        status: InvitationStatus.PENDING,
        sentAt: now,
        expiresAt:
          profileInvitationDeadline ??
          new Date(now.getTime() + profileInvitationExpirationHours * 3_600_000),
        usedAt: null,
      }),
    );

    return { token, invitation };
  }

  private async dispatch(
    prenom: string,
    email: string,
    token: string,
    expiresAt: Date | null,
  ): Promise<BulkSendReport> {
    return this.studentMailService.sendProfileFormInvitations([
      { prenom, email, token, expiresAt: expiresAt ?? new Date() },
    ]);
  }

  /**
   * Résout un token et garantit qu'il est encore utilisable.
   * L'expiration est appliquée de façon paresseuse : le statut passe à EXPIRED
   * au premier accès, sans tâche de fond.
   */
  private async resolve(token: string): Promise<ProfileInvitation> {
    const invitation = await this.invitations.findOne({
      where: { tokenHash: this.hash(token) },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation inconnue');
    }

    const expired =
      invitation.expiresAt !== null &&
      invitation.expiresAt.getTime() <= Date.now();
    if (expired && invitation.status === InvitationStatus.PENDING) {
      await this.invitations.update(
        { id: invitation.id },
        { status: InvitationStatus.EXPIRED },
      );
    }

    const status = expired ? InvitationStatus.EXPIRED : invitation.status;
    if (status === InvitationStatus.USED) {
      throw new GoneException('Cette invitation a déjà été utilisée');
    }
    if (status === InvitationStatus.EXPIRED) {
      throw new GoneException('Cette invitation a expiré');
    }
    if (status === InvitationStatus.CANCELLED) {
      throw new GoneException('Cette invitation a été annulée');
    }
    return invitation;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toView(invitation: ProfileInvitation): InvitationViewDto {
    const { tokenHash: _tokenHash, ...view } = invitation;
    return view;
  }
}
