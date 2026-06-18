import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generatePublicToken } from '../polls/public-token.util';
import { PublicPoll } from './dto/public-poll.dto';
import { PollResults } from './dto/poll-results.dto';
import { SubmitResponsesDto } from './dto/submit-responses.dto';

/**
 * Anonymous, read-only access to a poll via its public share token. Returns a sanitized shape that
 * never leaks the owner `userId` or any participant data — see {@link PublicPoll}.
 */
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a poll by its public token and return a sanitized view (dates → slots, both ordered by
   * sortOrder). An unknown/invalid token is a 404. Mirrors the include/orderBy of
   * `PollsService.findOneForUser`, but scopes on `publicToken` instead of ownership.
   */
  async findByPublicToken(token: string): Promise<PublicPoll> {
    const poll = await this.prisma.poll.findUnique({
      where: { publicToken: token },
      include: {
        dates: {
          orderBy: { sortOrder: 'asc' },
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException();
    }
    return {
      id: poll.id,
      title: poll.title,
      description: poll.description,
      timezone: poll.timezone,
      status: poll.status,
      dates: poll.dates.map((date) => ({
        id: date.id,
        eventDate: date.eventDate,
        sortOrder: date.sortOrder,
        slots: date.slots.map((slot) => ({
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAllDay: slot.isAllDay,
          label: slot.label,
          sortOrder: slot.sortOrder,
        })),
      })),
    };
  }

  /**
   * Compute the live per-slot tallies and the deterministic best slot for a poll. Queried fresh on
   * every call — it does NOT read the `slot_tallies` cache. An unknown token is a 404.
   *
   * Canonical scoring (DESIGN §4): `score = available*2 + maybe*1`. The 5-key tie-break is done in
   * SQL (score desc → available_count desc → unavailable_count asc → event_date/start_time asc →
   * slot.id asc), so `rows[0]` is the deterministic best. A LEFT JOIN keeps zero-response slots with
   * all-zero tallies. Raw `SUM(...)` results are coerced with `Number(...)`.
   */
  async getResults(token: string): Promise<PollResults> {
    const poll = await this.prisma.poll.findUnique({
      where: { publicToken: token },
    });
    if (!poll) {
      throw new NotFoundException();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        slot_id: bigint;
        available_count: bigint | number | string;
        maybe_count: bigint | number | string;
        unavailable_count: bigint | number | string;
        score: bigint | number | string;
        event_date: Date;
        start_time: Date | null;
        label: string | null;
      }>
    >(Prisma.sql`
      SELECT s.id AS slot_id,
             SUM(r.availability = 'available')   AS available_count,
             SUM(r.availability = 'maybe')       AS maybe_count,
             SUM(r.availability = 'unavailable') AS unavailable_count,
             (SUM(r.availability = 'available') * 2 + SUM(r.availability = 'maybe')) AS score,
             d.event_date AS event_date,
             s.start_time AS start_time,
             s.label      AS label
      FROM poll_slots s
      JOIN poll_dates d ON d.id = s.poll_date_id
      LEFT JOIN responses r ON r.poll_slot_id = s.id
      WHERE d.poll_id = ${poll.id}
      GROUP BY s.id, d.event_date, s.start_time, s.label
      ORDER BY score DESC,
               available_count DESC,
               unavailable_count ASC,
               event_date ASC,
               start_time ASC,
               s.id ASC
    `);

    const slots = rows.map((r) => ({
      slotId: r.slot_id as unknown as string,
      available: Number(r.available_count),
      maybe: Number(r.maybe_count),
      unavailable: Number(r.unavailable_count),
      score: Number(r.score),
    }));

    const top = rows[0];
    const best = top
      ? {
          slotId: top.slot_id as unknown as string,
          date: this.toDateString(top.event_date),
          label: top.label,
          score: Number(top.score),
        }
      : null;

    return { best, slots };
  }

  /** Format a `@db.Date` value as a `YYYY-MM-DD` string, dropping any time component. */
  private toDateString(date: Date): string {
    return new Date(date).toISOString().slice(0, 10);
  }

  /**
   * Create an anonymous participant and one response per answered slot, in a single transaction.
   * Returns only the participant's `{ publicToken }` (for later edit/re-submission) — never their
   * `id`, email, or any owner data. An unknown token is a 404; a slot that does not belong to this
   * poll (or a non-numeric id) is a 400. The two distinct UNIQUE constraints map to 409:
   * `participants @@unique([pollId, email])` (duplicate email) and
   * `responses @@unique([participantId, pollSlotId])` (duplicate slot answer).
   */
  async submitResponses(
    token: string,
    dto: SubmitResponsesDto,
  ): Promise<{ publicToken: string }> {
    const poll = await this.prisma.poll.findUnique({
      where: { publicToken: token },
      include: { dates: { include: { slots: true } } },
    });
    if (!poll) {
      throw new NotFoundException();
    }

    const validSlotIds = new Set(
      poll.dates.flatMap((date) => date.slots.map((slot) => slot.id)),
    );
    const slotIds = dto.answers.map((answer) => {
      let slotId: bigint;
      try {
        slotId = BigInt(answer.pollSlotId);
      } catch {
        throw new BadRequestException();
      }
      if (!validSlotIds.has(slotId)) {
        throw new BadRequestException();
      }
      return slotId;
    });

    const publicToken = generatePublicToken();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const participant = await tx.participant.create({
          data: {
            pollId: poll.id,
            publicToken,
            displayName: dto.displayName,
            email: dto.email ?? null,
          },
        });
        await tx.response.createMany({
          data: dto.answers.map((answer, i) => ({
            participantId: participant.id,
            pollSlotId: slotIds[i],
            availability: answer.availability,
          })),
        });
        return { publicToken: participant.publicToken };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = err.meta?.target;
        const targetStr = Array.isArray(target)
          ? target.join(',')
          : String(target);
        if (targetStr.includes('email')) {
          throw new ConflictException(
            'A participant with this email already responded to this poll',
          );
        }
        throw new ConflictException('Duplicate response for a slot');
      }
      throw err;
    }
  }
}
