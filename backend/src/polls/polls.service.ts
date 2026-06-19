import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PollStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePollDateDto,
  CreatePollDto,
  CreatePollSlotDto,
} from './dto/create-poll.dto';
import {
  UpdatePollDateDto,
  UpdatePollDto,
  UpdatePollSlotDto,
} from './dto/update-poll.dto';
import { buildShareUrl, generatePublicToken } from './public-token.util';

/** How many times to regenerate a colliding public_token before giving up. */
const MAX_TOKEN_ATTEMPTS = 3;

/** Convert a "HH:mm"/"HH:mm:ss" string to a Date for a Prisma @db.Time column; null when absent. */
function timeToDate(time?: string): Date | null {
  if (!time) {
    return null;
  }
  const normalized = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  return new Date(`1970-01-01T${normalized}Z`);
}

/** Stable identity of a slot for in-service dedupe — MySQL treats NULL end_times as distinct. */
function slotKey(slot: CreatePollSlotDto | UpdatePollSlotDto): string {
  return `${slot.startTime ?? ''}|${slot.endTime ?? ''}|${slot.isAllDay ?? false}`;
}

/**
 * Creator-owned poll CRUD (create + read for this phase). Ownership is enforced by scoping every
 * read on `userId`, so a non-owned poll is indistinguishable from a missing one (returns 404).
 */
@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Create a poll with its nested dates + slots in a single transaction. Slot uniqueness per date
   * is enforced here (not in the DB, which treats multiple NULL end_times as distinct). The
   * public_token is generated app-side; a P2002 collision on it triggers a bounded regenerate.
   */
  async create(userId: bigint, dto: CreatePollDto) {
    this.validateDates(dto.dates);

    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
      const publicToken = generatePublicToken();
      try {
        return await this.prisma.$transaction((tx) =>
          tx.poll.create({
            data: this.buildPollData(userId, dto, publicToken),
          }),
        );
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          if (this.isPublicTokenCollision(err)) {
            if (attempt < MAX_TOKEN_ATTEMPTS - 1) {
              continue; // regenerate the token and retry
            }
            throw new ConflictException(
              'Could not generate a unique public token',
            );
          }
          // Any other unique violation (e.g. duplicate eventDate within the poll).
          throw new ConflictException('Duplicate value violates a constraint');
        }
        throw err;
      }
    }
    // Unreachable: the loop either returns or throws on the final attempt.
    throw new ConflictException('Could not generate a unique public token');
  }

  /** All polls owned by the caller, newest first. Ownership enforced by the `where userId`. */
  findAllForUser(userId: bigint) {
    return this.prisma.poll.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * One owned poll with its nested dates → slots (both ordered by sortOrder). Scoping on
   * `{ id, userId }` means a non-owned or missing id is a 404 (no existence leak), not a 403.
   */
  async findOneForUser(userId: bigint, id: bigint) {
    const poll = await this.prisma.poll.findFirst({
      where: { id, userId },
      include: {
        dates: {
          orderBy: { sortOrder: 'asc' },
          include: {
            slots: {
              orderBy: { sortOrder: 'asc' },
              include: { _count: { select: { responses: true } } },
            },
          },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException();
    }
    return poll;
  }

  /**
   * Edit an open poll's scalar fields and (optionally) reconcile its nested dates + slots, all in
   * one transaction. Only keys present in the DTO are patched. Editing is gated to
   * `status === 'open'` — a 409 otherwise.
   *
   * `dates` is applied as a **diff** that preserves votes:
   * - When the poll has zero votes the diff collapses to the historical destructive replace
   *   (deleteMany → recreate) — fast and equivalent since nothing can be lost.
   * - Once any vote exists NO row is ever deleted. Existing rows are matched by `id`; a non-null
   *   incoming `invalidatedAt` soft-invalidates (votes kept), a `null` marker reactivates; rows
   *   without an `id` are created; rows absent from the payload are defensively soft-invalidated.
   *   A voted slot/date cannot be edited in place (a 409 directs the editor to invalidate + replace).
   */
  async update(pollId: bigint, dto: UpdatePollDto) {
    // Defensive: PollOwnershipGuard already loaded + ownership-checked the poll, but the service
    // stays self-contained so it is safe to call directly (e.g. from tests).
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.status !== PollStatus.open) {
      throw new ConflictException('Poll can only be edited while open');
    }
    if (dto.dates !== undefined) {
      this.validateDates(dto.dates); // re-assert non-empty + dedupe active slots before writing
    }

    const scalarPatch: Prisma.PollUncheckedUpdateInput = {};
    if (dto.title !== undefined) scalarPatch.title = dto.title;
    if (dto.description !== undefined)
      scalarPatch.description = dto.description;
    if (dto.timezone !== undefined) scalarPatch.timezone = dto.timezone;
    if (dto.closesAt !== undefined) {
      scalarPatch.closesAt =
        dto.closesAt == null ? null : new Date(dto.closesAt);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.poll.update({ where: { id: pollId }, data: scalarPatch });

      if (dto.dates !== undefined) {
        const voteCount = await this.countResponsesForPoll(tx, pollId);
        if (voteCount === 0) {
          await this.replaceDates(tx, pollId, dto.dates);
        } else {
          await this.diffDates(tx, pollId, dto.dates);
          await this.recomputeTallies(tx, pollId);
        }
      }

      return tx.poll.findUnique({
        where: { id: pollId },
        include: {
          dates: {
            orderBy: { sortOrder: 'asc' },
            include: {
              slots: {
                orderBy: { sortOrder: 'asc' },
                include: { _count: { select: { responses: true } } },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Zero-vote fast path: destructive full replace. Deleting poll_dates cascades to poll_slots
   * (onDelete: Cascade); recreated from the payload. finalSlotId is a circular FK (onDelete:
   * SetNull) but is always null while open, so the replace can never orphan it. Incoming rows
   * carrying an `invalidatedAt` marker are simply not recreated (the simplest honour of the marker
   * when there is nothing to preserve). The deleteMany-before-create ordering is load-bearing.
   */
  private async replaceDates(
    tx: Prisma.TransactionClient,
    pollId: bigint,
    dates: UpdatePollDateDto[],
  ): Promise<void> {
    await tx.pollDate.deleteMany({ where: { pollId } });
    const activeDates = dates.filter((date) => !this.isInvalidating(date));
    for (const date of this.buildDatesCreate(activeDates)) {
      await tx.pollDate.create({ data: { pollId, ...date } });
    }
  }

  /**
   * Has-votes diff path — NEVER deletes a row (a Response must never be lost). Matches incoming
   * dates/slots to existing rows by `id`, honours the `invalidatedAt` marker before any scalar
   * reconciliation, creates rows without an `id`, soft-invalidates rows absent from the payload,
   * and refuses an in-place edit of a voted date/slot with a 409.
   */
  private async diffDates(
    tx: Prisma.TransactionClient,
    pollId: bigint,
    incomingDates: UpdatePollDateDto[],
  ): Promise<void> {
    const existingDates = await tx.pollDate.findMany({
      where: { pollId },
      include: {
        slots: { include: { _count: { select: { responses: true } } } },
      },
    });
    const existingDateById = new Map(existingDates.map((d) => [d.id, d]));

    const seenDateIds = new Set<bigint>();
    for (const incoming of incomingDates) {
      if (incoming.id === undefined) {
        // Brand-new date + its slots. Skip if it arrives already-invalidated (nothing to preserve).
        if (this.isInvalidating(incoming)) {
          continue;
        }
        await tx.pollDate.create({
          data: { pollId, ...this.buildDatesCreate([incoming])[0] },
        });
        continue;
      }

      const dateId = this.parseRowId(incoming.id, 'date');
      const existingDate = existingDateById.get(dateId);
      if (!existingDate) {
        throw new BadRequestException('date does not belong to this poll');
      }
      seenDateIds.add(dateId);

      // Date-level marker first: invalidating a date cascades to its still-active slots and skips
      // per-slot reconciliation.
      if (this.isInvalidating(incoming)) {
        const invalidatedAt = new Date(incoming.invalidatedAt as string);
        await tx.pollDate.update({
          where: { id: dateId },
          data: { invalidatedAt },
        });
        await tx.pollSlot.updateMany({
          where: { pollDateId: dateId, invalidatedAt: null },
          data: { invalidatedAt },
        });
        continue;
      }
      // Reactivate a previously-invalidated date before reconciling its slots.
      if (existingDate.invalidatedAt != null) {
        await tx.pollDate.update({
          where: { id: dateId },
          data: { invalidatedAt: null },
        });
      }

      await this.diffSlots(tx, existingDate, incoming);
    }

    // Existing dates absent from the payload: soft-invalidate the date + its active slots.
    for (const existingDate of existingDates) {
      if (seenDateIds.has(existingDate.id)) {
        continue;
      }
      if (existingDate.invalidatedAt != null) {
        continue; // already invalidated — idempotent
      }
      const now = new Date();
      await tx.pollDate.update({
        where: { id: existingDate.id },
        data: { invalidatedAt: now },
      });
      await tx.pollSlot.updateMany({
        where: { pollDateId: existingDate.id, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
    }
  }

  /** Reconcile the slots of one matched (active) date. Never deletes; voted edits are a 409. */
  private async diffSlots(
    tx: Prisma.TransactionClient,
    existingDate: {
      id: bigint;
      eventDate: Date;
      sortOrder: number | null;
      slots: Array<{
        id: bigint;
        startTime: Date | null;
        endTime: Date | null;
        isAllDay: boolean;
        label: string | null;
        sortOrder: number | null;
        invalidatedAt: Date | null;
        _count: { responses: number };
      }>;
    },
    incoming: UpdatePollDateDto,
  ): Promise<void> {
    const existingSlotById = new Map(existingDate.slots.map((s) => [s.id, s]));
    const hasVotedSlot = existingDate.slots.some(
      (s) => s._count.responses >= 1,
    );

    // A voted date is immutable in place: refuse an eventDate change while votes exist.
    if (
      hasVotedSlot &&
      new Date(incoming.eventDate).getTime() !==
        existingDate.eventDate.getTime()
    ) {
      throw new ConflictException(
        'A slot with votes cannot be edited in place — invalidate it and add a replacement',
      );
    }
    // Patch the date's own sortOrder only when it has no voted slots.
    if (!hasVotedSlot && incoming.sortOrder !== undefined) {
      await tx.pollDate.update({
        where: { id: existingDate.id },
        data: {
          eventDate: new Date(incoming.eventDate),
          sortOrder: incoming.sortOrder,
        },
      });
    }

    const seenSlotIds = new Set<bigint>();
    for (const slot of incoming.slots) {
      if (slot.id === undefined) {
        await tx.pollSlot.create({
          data: {
            pollDateId: existingDate.id,
            startTime: timeToDate(slot.startTime),
            endTime: timeToDate(slot.endTime),
            isAllDay: slot.isAllDay,
            label: slot.label,
            sortOrder: slot.sortOrder,
          },
        });
        continue;
      }

      const slotId = this.parseRowId(slot.id, 'slot');
      const existingSlot = existingSlotById.get(slotId);
      if (!existingSlot) {
        throw new BadRequestException('slot does not belong to this poll');
      }
      seenSlotIds.add(slotId);

      // Marker first: invalidate / reactivate before any scalar reconciliation.
      if (this.isInvalidating(slot)) {
        await tx.pollSlot.update({
          where: { id: slotId },
          data: { invalidatedAt: new Date(slot.invalidatedAt as string) },
        });
        continue;
      }
      if (existingSlot.invalidatedAt != null) {
        await tx.pollSlot.update({
          where: { id: slotId },
          data: { invalidatedAt: null },
        });
        continue;
      }

      // Active row: reconcile scalars.
      if (this.slotScalarsUnchanged(existingSlot, slot)) {
        continue; // no-op
      }
      if (existingSlot._count.responses >= 1) {
        throw new ConflictException(
          'A slot with votes cannot be edited in place — invalidate it and add a replacement',
        );
      }
      await tx.pollSlot.update({
        where: { id: slotId },
        data: {
          startTime: timeToDate(slot.startTime),
          endTime: timeToDate(slot.endTime),
          isAllDay: slot.isAllDay,
          label: slot.label,
          sortOrder: slot.sortOrder,
        },
      });
    }

    // Existing slots absent from the incoming date: soft-invalidate (never delete).
    for (const existingSlot of existingDate.slots) {
      if (seenSlotIds.has(existingSlot.id)) {
        continue;
      }
      if (existingSlot.invalidatedAt != null) {
        continue; // already invalidated — idempotent
      }
      await tx.pollSlot.update({
        where: { id: existingSlot.id },
        data: { invalidatedAt: new Date() },
      });
    }
  }

  /** True when an incoming slot's scalar fields equal the existing row's (post-normalization). */
  private slotScalarsUnchanged(
    existing: {
      startTime: Date | null;
      endTime: Date | null;
      isAllDay: boolean;
      label: string | null;
    },
    incoming: UpdatePollSlotDto,
  ): boolean {
    const time = (d: Date | null) => (d ? d.getTime() : null);
    return (
      time(existing.startTime) === time(timeToDate(incoming.startTime)) &&
      time(existing.endTime) === time(timeToDate(incoming.endTime)) &&
      existing.isAllDay === (incoming.isAllDay ?? false) &&
      (existing.label ?? null) === (incoming.label ?? null)
    );
  }

  /**
   * Recompute the persisted `slot_tallies` cache for every still-active slot of the poll, mirroring
   * the submit-path recompute but excluding invalidated dates/slots from scoring. Tally rows for
   * just-invalidated slots are left in place (no longer read — results/best exclude them).
   */
  private async recomputeTallies(
    tx: Prisma.TransactionClient,
    pollId: bigint,
  ): Promise<void> {
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
             SUM(r.availability = 'available')   AS available_count,
             SUM(r.availability = 'maybe')       AS maybe_count,
             SUM(r.availability = 'unavailable') AS unavailable_count,
             (SUM(r.availability = 'available') * 2 + SUM(r.availability = 'maybe')) AS score
      FROM poll_slots s
      JOIN poll_dates d ON d.id = s.poll_date_id
      LEFT JOIN responses r ON r.poll_slot_id = s.id
      WHERE d.poll_id = ${pollId}
        AND s.invalidated_at IS NULL AND d.invalidated_at IS NULL
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
  }

  /**
   * Cancel an owned poll: `open → cancelled` only. Idempotent when already cancelled; a completed
   * poll must be reopened first (409). Runs in a transaction so the status re-check is TOCTOU-safe.
   */
  async cancel(pollId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const poll = await tx.poll.findUnique({ where: { id: pollId } });
      if (!poll) {
        throw new NotFoundException('Poll not found');
      }
      if (poll.status === PollStatus.cancelled) {
        return poll; // idempotent — no second update
      }
      if (poll.status === PollStatus.completed) {
        throw new ConflictException(
          'A completed poll cannot be cancelled; reopen it first',
        );
      }
      return tx.poll.update({
        where: { id: pollId },
        data: { status: PollStatus.cancelled },
      });
    });
  }

  /**
   * Reopen an owned poll: `cancelled → open` and `completed → open`. Reopening a completed poll
   * clears `finalSlotId` + `completedAt` (the circular FK reset). Idempotent when already open.
   */
  async reopen(pollId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const poll = await tx.poll.findUnique({ where: { id: pollId } });
      if (!poll) {
        throw new NotFoundException('Poll not found');
      }
      if (poll.status === PollStatus.open) {
        return poll; // idempotent
      }
      return tx.poll.update({
        where: { id: pollId },
        data: { status: PollStatus.open, finalSlotId: null, completedAt: null },
      });
    });
  }

  /** Delete an owned poll; cascade removes its dates, slots, and participants. */
  async remove(pollId: bigint): Promise<void> {
    try {
      await this.prisma.poll.delete({ where: { id: pollId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Poll not found');
      }
      throw err;
    }
  }

  /**
   * Finalize a poll: validate `finalSlotId` belongs to it, transition `open → completed`
   * (setting finalSlotId + completedAt) atomically, then fan out completion emails. Idempotent —
   * an already-completed poll returns unchanged and does not re-notify.
   */
  async complete(pollId: bigint, finalSlotId: bigint) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Defensive: PollOwnershipGuard already loaded + ownership-checked the poll.
      const poll = await tx.poll.findUnique({ where: { id: pollId } });
      if (!poll) {
        throw new NotFoundException('Poll not found');
      }

      // The slot must belong to this poll (joined through its date), else 400.
      const slot = await tx.pollSlot.findUnique({
        where: { id: finalSlotId },
        include: { date: true },
      });
      if (!slot || slot.date.pollId !== pollId) {
        throw new BadRequestException(
          'finalSlotId does not belong to this poll',
        );
      }

      if (poll.status === PollStatus.completed) {
        return { poll, transitioned: false }; // idempotent: no re-update, no re-notify
      }

      const updated = await tx.poll.update({
        where: { id: pollId },
        data: {
          status: PollStatus.completed,
          finalSlotId,
          completedAt: new Date(),
        },
      });
      return { poll: updated, transitioned: true };
    });

    // Notify only on a fresh transition; the service is itself idempotent via email_log, but
    // re-completing should never fan out again.
    if (result.transitioned) {
      await this.notifications.notifyPollCompleted(pollId);
    }
    return result.poll;
  }

  /**
   * Copy-paste invite text embedding the poll title and its public share URL
   * (`{APP_URL}/p/{publicToken}`). Read-only; 404 if the poll is gone.
   */
  async buildInviteMessage(
    pollId: bigint,
  ): Promise<{ message: string; shareUrl: string }> {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    const shareUrl = buildShareUrl(
      this.config.getOrThrow<string>('APP_URL'),
      poll.publicToken,
    );
    return {
      message: `You're invited to vote on "${poll.title}". Pick your availability here: ${shareUrl}`,
      shareUrl,
    };
  }

  /**
   * Reject empty dates / per-date slots and duplicate `(startTime,endTime,isAllDay)` slots. Accepts
   * either the create shape or the edit shape; a date/slot carrying a non-null `invalidatedAt` is
   * being deactivated, so its required-slot + dedupe checks are skipped (only ACTIVE rows are fully
   * validated). Create-path rows have no `invalidatedAt` and are therefore always validated.
   */
  private validateDates(
    dates?: Array<CreatePollDateDto | UpdatePollDateDto>,
  ): void {
    if (!dates?.length) {
      throw new BadRequestException('A poll needs at least one date');
    }
    for (const date of dates) {
      if (this.isInvalidating(date)) {
        continue; // a date being deactivated is not required to hold active slots
      }
      if (!date.slots?.length) {
        throw new BadRequestException('Each date needs at least one slot');
      }
      const seen = new Set<string>();
      for (const slot of date.slots) {
        if (this.isInvalidating(slot)) {
          continue; // a slot being deactivated is exempt from dedupe
        }
        const key = slotKey(slot);
        if (seen.has(key)) {
          throw new ConflictException('Duplicate slot on a date');
        }
        seen.add(key);
      }
    }
  }

  /** True when a date/slot DTO carries a non-null `invalidatedAt` marker (being deactivated). */
  private isInvalidating(
    row:
      | CreatePollDateDto
      | CreatePollSlotDto
      | UpdatePollDateDto
      | UpdatePollSlotDto,
  ): boolean {
    return 'invalidatedAt' in row && row.invalidatedAt != null;
  }

  /** Total `Response` rows across every slot of the poll — chooses the update path. */
  private countResponsesForPoll(
    tx: Prisma.TransactionClient,
    pollId: bigint,
  ): Promise<number> {
    return tx.response.count({ where: { slot: { date: { pollId } } } });
  }

  /** Parse a stringified BigInt id defensively; a bad id is a 400 (mirrors `parseId`). */
  private parseRowId(id: string, kind: 'date' | 'slot'): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`${kind} does not belong to this poll`);
    }
  }

  /** Map validated date DTOs to Prisma nested-create inputs (one per date, slots nested). */
  private buildDatesCreate(dates: CreatePollDateDto[]) {
    return dates.map((date) => ({
      eventDate: new Date(date.eventDate),
      sortOrder: date.sortOrder,
      slots: {
        create: date.slots.map((slot) => ({
          startTime: timeToDate(slot.startTime),
          endTime: timeToDate(slot.endTime),
          isAllDay: slot.isAllDay,
          label: slot.label,
          sortOrder: slot.sortOrder,
        })),
      },
    }));
  }

  /** Nested create payload — dates and their slots are created atomically with the poll. */
  private buildPollData(
    userId: bigint,
    dto: CreatePollDto,
    publicToken: string,
  ): Prisma.PollUncheckedCreateInput {
    return {
      userId,
      publicToken,
      title: dto.title,
      description: dto.description,
      timezone: dto.timezone, // undefined ⇒ schema default "UTC"
      dates: { create: this.buildDatesCreate(dto.dates) },
    };
  }

  /** True when a P2002 targets the polls.public_token unique index. */
  private isPublicTokenCollision(
    err: Prisma.PrismaClientKnownRequestError,
  ): boolean {
    const target = err.meta?.target;
    if (typeof target === 'string') {
      return target.includes('public_token');
    }
    if (Array.isArray(target)) {
      return target.includes('public_token') || target.includes('publicToken');
    }
    return false;
  }
}
