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
