import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Transports outbound mail via nodemailer. In dev it points at Mailpit (no auth);
 * config is driven entirely by the validated SMTP_* / MAIL_FROM env vars.
 *
 * MailService only delivers a pre-built magic link — token generation and hashing
 * belong to Phase 2's AuthService, not here.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.getOrThrow<string>('SMTP_HOST');
    const port = Number(this.config.getOrThrow<string>('SMTP_PORT'));
    this.from = this.config.getOrThrow<string>('MAIL_FROM');

    // env.validation coerces SMTP_SECURE to boolean; `?? false` is a safety net.
    const secure = this.config.get<boolean>('SMTP_SECURE') ?? false;

    // Mailpit needs no credentials, so auth is omitted when SMTP_USER is empty.
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const auth = user ? { user, pass } : undefined;

    this.transporter = nodemailer.createTransport({ host, port, secure, auth });
  }

  async sendMagicLink(email: string, link: string): Promise<void> {
    const subject = 'Your Pollendar sign-in link';
    const text = `Sign in to Pollendar by opening this link:\n\n${link}\n\nThis link expires shortly and can be used once. If you didn't request it, ignore this email.`;
    const html = `<p>Sign in to Pollendar by opening this link:</p>\n<p><a href="${link}">Sign in to Pollendar</a></p>\n<p>This link expires shortly and can be used once. If you didn't request it, ignore this email.</p>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Magic link sent to ${email}`);
    } catch (err) {
      this.logger.error(
        `Failed to send magic link to ${email}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async sendPollCompleted(
    email: string,
    pollTitle: string,
    finalSlotLabel: string,
    shareUrl: string,
  ): Promise<void> {
    const subject = `Poll "${pollTitle}" is finalized`;
    const text = `The poll "${pollTitle}" has been finalized.\n\nFinal slot: ${finalSlotLabel}\n\nView the poll: ${shareUrl}`;
    const html = `<p>The poll "${pollTitle}" has been finalized.</p>\n<p>Final slot: <strong>${finalSlotLabel}</strong></p>\n<p><a href="${shareUrl}">View the poll</a></p>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Completion email sent to ${email}`);
    } catch (err) {
      this.logger.error(
        `Failed to send completion email to ${email}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
