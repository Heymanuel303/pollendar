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
import { UpdatePollDto } from './dto/update-poll.dto';
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
function slotKey(slot: CreatePollSlotDto): string {
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
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException();
    }
    return poll;
  }

  /**
   * Edit an open poll's scalar fields and (optionally) fully replace its nested dates + slots, all
   * in one transaction. Only keys present in the DTO are patched. Editing is gated to
   * `status === 'open'` — a 409 otherwise.
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
      this.validateDates(dto.dates); // re-assert non-empty + dedupe slots before writing
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
        // Replace nested data: deleting poll_dates cascades to poll_slots (onDelete: Cascade).
        // finalSlotId is a circular FK to PollSlot (onDelete: SetNull), but it is only set at
        // completion and editing is gated to status === 'open', so while open it is always null —
        // the replace can never orphan it and no extra null-out step is needed.
        await tx.pollDate.deleteMany({ where: { pollId } });
        for (const date of this.buildDatesCreate(dto.dates)) {
          await tx.pollDate.create({ data: { pollId, ...date } });
        }
      }

      return tx.poll.findUnique({
        where: { id: pollId },
        include: {
          dates: {
            orderBy: { sortOrder: 'asc' },
            include: { slots: { orderBy: { sortOrder: 'asc' } } },
          },
        },
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

  /** Reject empty dates / per-date slots and duplicate `(startTime,endTime,isAllDay)` slots. */
  private validateDates(dates?: CreatePollDateDto[]): void {
    if (!dates?.length) {
      throw new BadRequestException('A poll needs at least one date');
    }
    for (const date of dates) {
      if (!date.slots?.length) {
        throw new BadRequestException('Each date needs at least one slot');
      }
      const seen = new Set<string>();
      for (const slot of date.slots) {
        const key = slotKey(slot);
        if (seen.has(key)) {
          throw new ConflictException('Duplicate slot on a date');
        }
        seen.add(key);
      }
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
