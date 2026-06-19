import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Availability, PollStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generatePublicToken } from '../polls/public-token.util';
import { PublicPoll } from './dto/public-poll.dto';
import { PollResults } from './dto/poll-results.dto';
import {
  ParticipantResponses,
  ParticipantWithResponses,
} from './dto/participant-responses.dto';
import { SubmitResponsesDto } from './dto/submit-responses.dto';

/**
 * Anonymous, read-only access to a poll via its public share token. Returns a sanitized shape that
 * never leaks the owner `userId` or any participant data, see {@link PublicPoll}.
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
          where: { invalidatedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            slots: {
              where: { invalidatedAt: null },
              orderBy: { sortOrder: 'asc' },
            },
          },
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
   * every call, it does NOT read the `slot_tallies` cache. An unknown token is a 404.
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
             COUNT(*) FILTER (WHERE r.availability = 'available')   AS available_count,
             COUNT(*) FILTER (WHERE r.availability = 'maybe')       AS maybe_count,
             COUNT(*) FILTER (WHERE r.availability = 'unavailable') AS unavailable_count,
             (COUNT(*) FILTER (WHERE r.availability = 'available') * 2 + COUNT(*) FILTER (WHERE r.availability = 'maybe')) AS score,
             d.event_date AS event_date,
             s.start_time AS start_time,
             s.label      AS label
      FROM poll_slots s
      JOIN poll_dates d ON d.id = s.poll_date_id
      LEFT JOIN responses r ON r.poll_slot_id = s.id
      WHERE d.poll_id = ${poll.id}
        AND d.invalidated_at IS NULL
        AND s.invalidated_at IS NULL
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

  /**
   * Per-participant `displayName` + per-slot answers for a poll, reachable via the public token. A
   * participant's `email` NEVER reaches the wire, it is excluded at the SQL SELECT level (the
   * SELECT enumerates only `id`/`display_name`, never `*`), not mapped away afterward. There is NO
   * `status` check and NO submit-gate: rows are returned for open AND completed/cancelled polls
   * alike; the only gate is a valid token (unknown token → 404).
   *
   * Pagination counts PARTICIPANTS (not response rows): the participant page is selected in a
   * subquery, then LEFT JOINed to `responses` so zero-response participants still appear (with
   * `answers: []`). Values flow into the query only via `Prisma.sql` `${...}` parameterization.
   * `participantId`/`pollSlotId` stay raw `bigint`; the `BigIntSerializerInterceptor` stringifies
   * them on the wire (the DTO types them `string` only to document that contract).
   */
  async getParticipantResponses(
    token: string,
    limit?: number,
    offset?: number,
  ): Promise<ParticipantResponses> {
    const poll = await this.prisma.poll.findUnique({
      where: { publicToken: token },
    });
    if (!poll) {
      throw new NotFoundException();
    }

    const take = Math.min(
      Math.max(
        Number.isFinite(limit) && (limit ?? NaN) > 0 ? Math.floor(limit!) : 100,
        1,
      ),
      1000,
    );
    const skip =
      Number.isFinite(offset) && (offset ?? 0) > 0 ? Math.floor(offset!) : 0;

    const total = await this.prisma.participant.count({
      where: { pollId: poll.id },
    });

    const rows = await this.prisma.$queryRaw<
      Array<{
        participant_id: bigint;
        display_name: string;
        poll_slot_id: bigint | null;
        availability: Availability | null;
      }>
    >(Prisma.sql`
      SELECT p.id            AS participant_id,
             p.display_name  AS display_name,
             r.poll_slot_id  AS poll_slot_id,
             r.availability  AS availability
      FROM (
        SELECT id, display_name
        FROM participants
        WHERE poll_id = ${poll.id}
        ORDER BY id ASC
        LIMIT ${take} OFFSET ${skip}
      ) p
      LEFT JOIN responses r ON r.participant_id = p.id
      ORDER BY p.id ASC, r.poll_slot_id ASC
    `);

    const byId = new Map<bigint, ParticipantWithResponses>();
    const participants: ParticipantWithResponses[] = [];
    for (const row of rows) {
      let entry = byId.get(row.participant_id);
      if (!entry) {
        entry = {
          participantId: row.participant_id as unknown as string,
          displayName: row.display_name,
          answers: [],
        };
        byId.set(row.participant_id, entry);
        participants.push(entry);
      }
      if (row.poll_slot_id !== null) {
        entry.answers.push({
          pollSlotId: row.poll_slot_id as unknown as string,
          availability: row.availability!,
        });
      }
    }

    return { participants, total, hasMore: skip + participants.length < total };
  }

  /** Format a `@db.Date` value as a `YYYY-MM-DD` string, dropping any time component. */
  private toDateString(date: Date): string {
    return new Date(date).toISOString().slice(0, 10);
  }

  /**
   * Create an anonymous participant and one response per answered slot, in a single transaction.
   * Returns only the participant's `{ publicToken }` (for later edit/re-submission), never their
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
      include: {
        dates: {
          where: { invalidatedAt: null },
          include: { slots: { where: { invalidatedAt: null } } },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException();
    }
    if (poll.status !== PollStatus.open) {
      throw new ConflictException('This poll is no longer accepting responses');
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

        // Recompute the persisted `slot_tallies` cache inside the same transaction so it commits
        // atomically with the participant + responses. This cache is a denormalized source of truth
        // for the creator view (dashboards / completion flow) and `best`; it is NOT the source for
        // `GET /api/public/polls/:token/results`, which stays a LIVE computation to avoid stale reads
        // when a submission races in after a prior commit. Scoring here is kept identical to
        // `getResults` so the live and cached values never diverge. The LEFT JOIN keeps zero-response
        // slots present with all-zero tallies; raw SUM(...) results are coerced with `Number(...)`.
        const tallyRows = await tx.$queryRaw<
          Array<{
            id: bigint;
            available_count: bigint | number | string;
            maybe_count: bigint | number | string;
            unavailable_count: bigint | number | string;
            score: bigint | number | string;
          }>
        >(Prisma.sql`
          SELECT s.id AS id,
                 COUNT(*) FILTER (WHERE r.availability = 'available')   AS available_count,
                 COUNT(*) FILTER (WHERE r.availability = 'maybe')       AS maybe_count,
                 COUNT(*) FILTER (WHERE r.availability = 'unavailable') AS unavailable_count,
                 (COUNT(*) FILTER (WHERE r.availability = 'available') * 2 + COUNT(*) FILTER (WHERE r.availability = 'maybe')) AS score
          FROM poll_slots s
          JOIN poll_dates d ON d.id = s.poll_date_id
          LEFT JOIN responses r ON r.poll_slot_id = s.id
          WHERE d.poll_id = ${poll.id}
            AND d.invalidated_at IS NULL
            AND s.invalidated_at IS NULL
          GROUP BY s.id
        `);

        for (const row of tallyRows) {
          const availableCount = Number(row.available_count);
          const maybeCount = Number(row.maybe_count);
          const unavailableCount = Number(row.unavailable_count);
          const score = Number(row.score);
          await tx.slotTally.upsert({
            where: { pollSlotId: row.id },
            update: { availableCount, maybeCount, unavailableCount, score },
            create: {
              pollSlotId: row.id,
              availableCount,
              maybeCount,
              unavailableCount,
              score,
            },
          });
        }

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
