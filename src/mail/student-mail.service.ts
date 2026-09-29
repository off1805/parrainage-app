import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';
import { MailService } from './mail.service.js';
import {
  BulkSendReport,
  PhotoUploadRecipient,
  ProfileInvitationRecipient,
} from './interfaces/mail-recipients.interfaces.js';

@Injectable()
export class StudentMailService {
  private readonly logger = new Logger(StudentMailService.name);
  private readonly limit = pLimit(3); // 3 envois simultanés max

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
        subject: 'Complète ton profil pour le programme de parrainage',
        template: 'profile-invitation',
        context: (r) => ({
          prenom: r.prenom,
          formUrl: `${frontendUrl}/invitation?token=${encodeURIComponent(r.token)}`,
          expiresAt: r.expiresAt.toLocaleDateString('fr-FR'),
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
    const results = await Promise.allSettled(
      recipients.map((r) =>
        this.limit(() =>
          this.mail.send({
            to: r.email,
            subject: options.subject,
            template: options.template,
            context: options.context(r),
          }),
        ),
      ),
    );

    const failed = results.flatMap((result, i) =>
      result.status === 'rejected'
        ? [{ email: recipients[i]!.email, reason: String(result.reason) }]
        : [],
    );

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
