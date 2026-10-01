import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';
import {
  BulkSendReport,
  PhotoUploadRecipient,
  ProfileInvitationRecipient,
} from './interfaces/mail-recipients.interfaces.js';

/** « samedi 3 octobre 2026 à 12h00 », à l'heure du Cameroun quel que soit le fuseau du serveur. */
function formatDeadline(date: Date): string {
  const tz = { timeZone: 'Africa/Douala' } as const;
  const day = date.toLocaleDateString('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `${day} à ${time}`;
}

export const PROFILE_INVITATION_SUBJECT = 'Complète ton profil pour le programme de parrainage';

@Injectable()
export class StudentMailService {
  private readonly logger = new Logger(StudentMailService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async sendPhotoUploadInvitations(
    recipients: PhotoUploadRecipient[],
  ): Promise<BulkSendReport> {
    const { appBaseUrl } = this.config.getOrThrow('mail');

    return this.dispatch(
      recipients,
      {
        subject: 'Envoie ta photo pour le parrainage',
        template: 'photo-upload-invitation',
        context: (r) => ({
          prenom: r.prenom,
          uploadUrl: `${appBaseUrl}/upload/${r.uploadToken}`,
          expiresAt: r.uploadTokenExpiresAt.toLocaleDateString('fr-FR'),
        }),
      },
      'Invitations photo',
    );
  }

  /**
   * Envoie par email le lien permettant de compléter le profil
   * (photo + WhatsApp) via le formulaire du front.
   */
  async sendProfileFormInvitations(
    recipients: ProfileInvitationRecipient[],
  ): Promise<BulkSendReport> {
    const { frontendUrl } = this.config.getOrThrow('app');

    return this.dispatch(
      recipients,
      {
        subject: PROFILE_INVITATION_SUBJECT,
        template: 'profile-invitation',
        context: (r) => ({
          prenom: r.prenom,
          formUrl: `${frontendUrl}/invitation?token=${encodeURIComponent(r.token)}`,
          expiresAt: formatDeadline(r.expiresAt),
        }),
      },
      'Invitations profil',
    );
  }

  private async dispatch<T extends { email: string }>(
    recipients: T[],
    options: {
      subject: string;
      template: string;
      context: (recipient: T) => Record<string, unknown>;
    },
    label: string,
  ): Promise<BulkSendReport> {
    const failed = await this.mail.sendBulk({
      subject: options.subject,
      template: options.template,
      recipients: recipients.map((r) => ({ to: r.email, context: options.context(r) })),
    });

    const report: BulkSendReport = {
      total: recipients.length,
      sent: recipients.length - failed.length,
      failed,
    };

    this.logger.log(`${label} : ${report.sent}/${report.total} envoyées`);
    if (failed.length) this.logger.warn(`Échecs : ${JSON.stringify(failed)}`);

    return report;
  }
}
