import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import type { Transporter } from 'nodemailer';
import { MAIL_TRANSPORT } from './mail.constants.js';

export interface SendMailOptions {
    to: string;
    subject: string;
    template: string; // nom du fichier sans extension, ex: 'photo-upload-invitation'
    context: Record<string, unknown>;
}

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
        const { fromName, fromEmail } = this.config.getOrThrow('mail');

        await this.transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html,
        });

        this.logger.log(`Email "${template}" envoyé à ${to}`);
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