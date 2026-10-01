import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import type { Transporter } from 'nodemailer';
import pLimit from 'p-limit';
import { MAIL_TRANSPORT } from './mail.constants.js';

export interface SendMailOptions {
    to: string;
    subject: string;
    template: string; // nom du fichier sans extension, ex: 'photo-upload-invitation'
    context: Record<string, unknown>;
}

export interface BulkMailOptions {
    subject: string;
    template: string;
    recipients: { to: string; context: Record<string, unknown> }[];
}

/** Brevo accepte au plus 1000 versions de message par appel. */
const BREVO_BATCH_SIZE = 1000;

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly templatesDir = join(import.meta.dirname, 'templates');
    private readonly templateCache = new Map<string, Handlebars.TemplateDelegate>();

    constructor(
        @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
        private readonly config: ConfigService,
    ) {}

    async send({ to, subject, template, context }: SendMailOptions): Promise<void> {
        const html = await this.render(template, context);
        const { fromName, fromEmail, brevoApiKey } = this.config.getOrThrow('mail');

        if (brevoApiKey) {
            await this.sendWithBrevo(brevoApiKey, { name: fromName, email: fromEmail }, to, subject, html);
        } else {
            await this.transport.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to,
                subject,
                html,
            });
        }

        this.logger.log(`Email "${template}" envoyé à ${to}`);
    }

    /**
     * Envoie un même modèle à plusieurs destinataires, chacun avec son contenu.
     * - Brevo : un appel API par lot de 1000 (`messageVersions`), quelques secondes pour 200 mails.
     * - SMTP : envois unitaires, 3 en parallèle.
     * Renvoie la liste des échecs (vide si tout est parti).
     */
    async sendBulk({ subject, template, recipients }: BulkMailOptions): Promise<{ email: string; reason: string }[]> {
        const { fromName, fromEmail, brevoApiKey } = this.config.getOrThrow('mail');
        const failed: { email: string; reason: string }[] = [];

        if (!brevoApiKey) {
            const limit = pLimit(3);
            await Promise.all(
                recipients.map((r) =>
                    limit(() =>
                        this.send({ to: r.to, subject, template, context: r.context }).catch((e: unknown) => {
                            failed.push({ email: r.to, reason: String(e) });
                        }),
                    ),
                ),
            );
            return failed;
        }

        for (let i = 0; i < recipients.length; i += BREVO_BATCH_SIZE) {
            const batch = recipients.slice(i, i + BREVO_BATCH_SIZE);
            const versions = await Promise.all(
                batch.map(async (r) => ({ to: [{ email: r.to }], htmlContent: await this.render(template, r.context) })),
            );
            try {
                await this.brevo(brevoApiKey, {
                    sender: { name: fromName, email: fromEmail },
                    subject,
                    // Contenu par défaut exigé par l'API ; chaque version a le sien
                    htmlContent: versions[0]!.htmlContent,
                    messageVersions: versions,
                });
                this.logger.log(`Email "${template}" : lot de ${batch.length} envoyé via Brevo`);
            } catch (e) {
                failed.push(...batch.map((r) => ({ email: r.to, reason: String(e) })));
            }
        }
        return failed;
    }

    /**
     * Envoi par l'API HTTP de Brevo (port 443). Utilisé quand BREVO_API_KEY est
     * défini : certains hébergeurs (Render gratuit) bloquent les ports SMTP.
     */
    private async sendWithBrevo(
        apiKey: string,
        sender: { name: string; email: string },
        to: string,
        subject: string,
        htmlContent: string,
    ): Promise<void> {
        await this.brevo(apiKey, { sender, to: [{ email: to }], subject, htmlContent });
    }

    private async brevo(apiKey: string, body: Record<string, unknown>): Promise<void> {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Brevo ${res.status} : ${detail.slice(0, 300)}`);
        }
    }

    private async render(name: string, context: Record<string, unknown>): Promise<string> {
        let compiled = this.templateCache.get(name);
        if (!compiled) {
            const source = await readFile(join(this.templatesDir, `${name}.hbs`), 'utf-8');
            compiled = Handlebars.compile(source, { strict: true });
            this.templateCache.set(name, compiled);
        }
        return compiled(context);
    }
}