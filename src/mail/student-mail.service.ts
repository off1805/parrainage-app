import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';
import { MailService } from './mail.service.js';
import {BulkSendReport, PhotoUploadRecipient} from "./interfaces/mail-recipients.interfaces.js";

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

        const results = await Promise.allSettled(
            recipients.map((r) =>
                this.limit(() =>
                    this.mail.send({
                        to: r.email,
                        subject: 'Envoie ta photo pour le parrainage',
                        template: 'photo-upload-invitation',
                        context: {
                            prenom: r.prenom,
                            uploadUrl: `${appBaseUrl}/upload/${r.uploadToken}`,
                            expiresAt: r.uploadTokenExpiresAt.toLocaleDateString('fr-FR'),
                        },
                    }),
                ),
            ),
        );

        const failed = results.flatMap((result, i) =>
            result.status === 'rejected'
                ? [{ email: recipients[i].email, reason: String(result.reason) }]
                : [],
        );

        const report: BulkSendReport = {
            total: recipients.length,
            sent: recipients.length - failed.length,
            failed,
        };

        this.logger.log(`Invitations photo : ${report.sent}/${report.total} envoyées`);
        if (failed.length) this.logger.warn(`Échecs : ${JSON.stringify(failed)}`);

        return report;
    }
}