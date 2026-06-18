import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicPoll } from './dto/public-poll.dto';

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
}
