import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto, CreatePollSlotDto } from './dto/create-poll.dto';
import { generatePublicToken } from './public-token.util';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a poll with its nested dates + slots in a single transaction. Slot uniqueness per date
   * is enforced here (not in the DB, which treats multiple NULL end_times as distinct). The
   * public_token is generated app-side; a P2002 collision on it triggers a bounded regenerate.
   */
  async create(userId: bigint, dto: CreatePollDto) {
    if (!dto.dates?.length) {
      throw new BadRequestException('A poll needs at least one date');
    }
    for (const date of dto.dates) {
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
      dates: {
        create: dto.dates.map((date) => ({
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
        })),
      },
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
