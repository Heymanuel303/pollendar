import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus, EmailType, Prisma } from '@prisma/client';
import type { Participant } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { buildShareUrl } from '../polls/public-token.util';
import { PrismaService } from '../prisma/prisma.service';

/** VarChar(500) ceiling for EmailLog.error — truncate any captured message to fit. */
const ERROR_MAX_LEN = 500;

/**
 * Fans out poll-completion emails to participants who left an address, recording one
 * idempotent `email_log` row per participant keyed by UNIQUE(poll_id, participant_id, type).
 * A row already marked `sent` is never re-sent; a single failed send never aborts the rest.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async sendPollCompletedEmails(
    pollId: bigint,
    pollTitle: string,
    publicToken: string,
    finalSlotLabel: string,
  ): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const shareUrl = buildShareUrl(appUrl, publicToken);

    const participants = await this.prisma.participant.findMany({
      where: { pollId, email: { not: null } },
    });

    if (participants.length === 0) {
      this.logger.log(
        `Poll ${pollId} has no emailable participants; sending nothing`,
      );
      return;
    }

    for (const participant of participants) {
      await this.sendOne(
        pollId,
        participant,
        pollTitle,
        finalSlotLabel,
        shareUrl,
      );
    }
  }

  /**
   * Reserve (or locate) the `email_log` row for one participant, then send. Catches every
   * failure so one bad address never stops the loop. Returns without sending when a `sent`
   * row already exists.
   */
  private async sendOne(
    pollId: bigint,
    participant: Participant,
    pollTitle: string,
    finalSlotLabel: string,
    shareUrl: string,
  ): Promise<void> {
    // email is non-null by the findMany filter, but the type is `string | null`.
    const toEmail = participant.email as string;

    const reservation = await this.reserve(pollId, participant.id, toEmail);
    if (reservation === null) {
      this.logger.log(
        `Completion email for participant ${participant.id} already sent; skipping`,
      );
      return;
    }

    try {
      await this.mail.sendPollCompleted(
        toEmail,
        pollTitle,
        finalSlotLabel,
        shareUrl,
      );
      await this.prisma.emailLog.update({
        where: { id: reservation },
        data: { status: EmailStatus.sent, sentAt: new Date(), error: null },
      });
      this.logger.log(
        `Completion email sent to participant ${participant.id} (${toEmail})`,
      );
    } catch (err) {
      this.logger.error(
        `Completion email to participant ${participant.id} failed`,
        err instanceof Error ? err.stack : String(err),
      );
      const message = (err instanceof Error ? err.message : String(err)).slice(
        0,
        ERROR_MAX_LEN,
      );
      await this.prisma.emailLog.update({
        where: { id: reservation },
        data: { status: EmailStatus.failed, error: message },
      });
    }
  }

  /**
   * Idempotency gate. Returns the id of a `queued`/reusable `email_log` row to send against,
   * or `null` when a `sent` row already exists (skip). Tolerates a concurrent reservation
   * racing the create (P2002) by re-reading the row.
   */
  private async reserve(
    pollId: bigint,
    participantId: bigint,
    toEmail: string,
  ): Promise<bigint | null> {
    return this.prisma.$transaction(async (tx) => {
      const compoundWhere = {
        pollId_participantId_type: {
          pollId,
          participantId,
          type: EmailType.poll_completed,
        },
      };

      const existing = await tx.emailLog.findUnique({ where: compoundWhere });
      if (existing) {
        return existing.status === EmailStatus.sent ? null : existing.id;
      }

      try {
        const created = await tx.emailLog.create({
          data: {
            pollId,
            participantId,
            type: EmailType.poll_completed,
            toEmail,
            status: EmailStatus.queued,
          },
        });
        return created.id;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const raced = await tx.emailLog.findUnique({ where: compoundWhere });
          if (raced) {
            return raced.status === EmailStatus.sent ? null : raced.id;
          }
        }
        throw err;
      }
    });
  }
}
