import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import mailConfig from './mail.config';
import { TemplateName, TemplateParams, templates } from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @Inject(mailConfig.KEY)
    private readonly config: ConfigType<typeof mailConfig>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  get appUrl(): string {
    return this.config.appUrl;
  }

  async send<T extends TemplateName>(to: string, template: T, params: TemplateParams<T>) {
    const render = templates[template] as (p: TemplateParams<T>) => ReturnType<(typeof templates)[T]>;
    const { subject, text, html } = render(params);
    await this.transporter.sendMail({ from: this.config.from, to, subject, text, html });
    // Log the template only: the body can contain single-use links.
    this.logger.log(`Sent "${template}" email`);
  }
}
