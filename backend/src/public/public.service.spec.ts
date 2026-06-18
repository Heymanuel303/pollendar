import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicService } from './public.service';
import { SubmitResponsesDto } from './dto/submit-responses.dto';

const pollFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const transaction = jest.fn();
const queryRaw = jest.fn<Promise<unknown>, [unknown]>();

const prisma: Partial<PrismaService> = {
  poll: { findUnique: pollFindUnique } as never,
  $transaction: transaction as never,
  $queryRaw: queryRaw as never,
};

/** A raw Prisma row including owner/participant fields the sanitizer must strip. */
const rawPoll = {
  id: 3n,
  userId: 99n,
  publicToken: 'tok',
  finalSlotId: null,
  closesAt: null,
  completedAt: null,
  title: 'Team sync',
  description: 'Weekly',
  timezone: 'UTC',
  status: 'open',
  participants: [{ id: 1n, email: 'leak@example.com' }],
  dates: [
    {
      id: 10n,
      eventDate: new Date('2026-07-01'),
      sortOrder: 0,
      slots: [
        {
          id: 100n,
          startTime: null,
          endTime: null,
          isAllDay: true,
          label: 'All day',
          sortOrder: 0,
        },
      ],
    },
  ],
};

describe('PublicService', () => {
  let service: PublicService;

  beforeEach(async () => {
    pollFindUnique.mockReset();
    transaction.mockReset();
    queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [PublicService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PublicService);
  });

  describe('findByPublicToken', () => {
    it('queries by publicToken with ordered nested dates → slots', async () => {
      pollFindUnique.mockResolvedValue(rawPoll);

      await service.findByPublicToken('tok');

      expect(pollFindUnique).toHaveBeenCalledWith({
        where: { publicToken: 'tok' },
        include: {
          dates: {
            orderBy: { sortOrder: 'asc' },
            include: { slots: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });
    });

    it('returns a sanitized shape with no userId, email, or participant data', async () => {
      pollFindUnique.mockResolvedValue(rawPoll);

      const result = await service.findByPublicToken('tok');

      expect(result).toEqual({
        id: 3n,
        title: 'Team sync',
        description: 'Weekly',
        timezone: 'UTC',
        status: 'open',
        dates: [
          {
            id: 10n,
            eventDate: new Date('2026-07-01'),
            sortOrder: 0,
            slots: [
              {
                id: 100n,
                startTime: null,
                endTime: null,
                isAllDay: true,
                label: 'All day',
                sortOrder: 0,
              },
            ],
          },
        ],
      });
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('participants');
      const serialized = JSON.stringify(result, (_k, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v,
      );
      expect(serialized).not.toContain('leak@example.com');
    });

    it('throws 404 for an unknown token', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.findByPublicToken('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('submitResponses', () => {
    /** Raw poll with the include shape submitResponses uses (dates → slots, no orderBy). */
    const pollWithSlots = {
      id: 3n,
      publicToken: 'tok',
      dates: [{ id: 10n, slots: [{ id: 100n }, { id: 101n }] }],
    };

    const dto: SubmitResponsesDto = {
      displayName: 'Ada',
      email: 'ada@example.com',
      answers: [{ pollSlotId: '100', availability: 'available' }],
    };

    /** Mock $transaction to run its callback with a tx whose create/createMany are spies. */
    function mockTransaction(participantPublicToken = 'newtoken') {
      const participantCreate = jest
        .fn<Promise<{ id: bigint; publicToken: string }>, [unknown]>()
        .mockResolvedValue({ id: 7n, publicToken: participantPublicToken });
      const responseCreateMany = jest
        .fn<Promise<{ count: number }>, [unknown]>()
        .mockResolvedValue({ count: 1 });
      transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb({
          participant: { create: participantCreate },
          response: { createMany: responseCreateMany },
        }),
      );
      return { participantCreate, responseCreateMany };
    }

    it('returns { publicToken } and creates participant + responses in the transaction', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      const { participantCreate, responseCreateMany } = mockTransaction('abc');

      const result = await service.submitResponses('tok', dto);

      expect(result).toEqual({ publicToken: 'abc' });
      const participantArg = participantCreate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(participantArg.data).toMatchObject({
        pollId: 3n,
        displayName: 'Ada',
        email: 'ada@example.com',
      });
      expect(typeof participantArg.data.publicToken).toBe('string');
      expect(responseCreateMany).toHaveBeenCalledWith({
        data: [
          { participantId: 7n, pollSlotId: 100n, availability: 'available' },
        ],
      });
    });

    it('leaks no id, email, or userId in the result', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      mockTransaction();

      const result = await service.submitResponses('tok', dto);

      expect(Object.keys(result)).toEqual(['publicToken']);
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('userId');
    });

    it('persists null email when none is provided', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      const { participantCreate } = mockTransaction();

      await service.submitResponses('tok', {
        displayName: 'Anon',
        answers: [{ pollSlotId: '100', availability: 'maybe' }],
      });

      const participantArg = participantCreate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(participantArg.data.email).toBeNull();
    });

    it('throws 404 when the token is unknown', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.submitResponses('nope', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws 400 when a pollSlotId is non-numeric', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      await expect(
        service.submitResponses('tok', {
          displayName: 'Ada',
          answers: [{ pollSlotId: 'abc', availability: 'available' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws 400 when a slot does not belong to the poll', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      await expect(
        service.submitResponses('tok', {
          displayName: 'Ada',
          answers: [{ pollSlotId: '999', availability: 'available' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('maps P2002 on the participant email constraint to a 409', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '7.0.0',
          meta: { target: 'participants_poll_id_email_key' },
        }),
      );

      const err: unknown = await service
        .submitResponses('tok', dto)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(
        'A participant with this email already responded to this poll',
      );
    });

    it('maps P2002 on the response slot constraint to a 409', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '7.0.0',
          meta: { target: 'responses_participant_id_poll_slot_id_key' },
        }),
      );

      const err: unknown = await service
        .submitResponses('tok', dto)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(
        'Duplicate response for a slot',
      );
    });

    it('re-throws non-P2002 errors unchanged', async () => {
      pollFindUnique.mockResolvedValue(pollWithSlots);
      const boom = new Error('boom');
      transaction.mockRejectedValue(boom);
      await expect(service.submitResponses('tok', dto)).rejects.toBe(boom);
    });
  });

  describe('getResults', () => {
    const eventDate = new Date('2026-07-01');

    /**
     * Rows as the canonical SQL would return them: already sorted by the 5-key tie-break. The service
     * trusts that ordering, so the test feeds DB-sorted rows. `available_count` for A is a string to
     * prove the `Number(...)` coercion. Worked example: A=3/0/1, B=2/2/0 (tie on score 6, A wins on
     * available_count), C=2/1/1 (score 5, third). A zero-response slot (99n) trails with all zeros.
     */
    const sortedRows = [
      {
        slot_id: 10n,
        available_count: '3',
        maybe_count: 0,
        unavailable_count: 1,
        score: 6,
        event_date: eventDate,
        start_time: null,
        label: 'A',
      },
      {
        slot_id: 11n,
        available_count: 2,
        maybe_count: 2,
        unavailable_count: 0,
        score: 6,
        event_date: eventDate,
        start_time: null,
        label: 'B',
      },
      {
        slot_id: 12n,
        available_count: 2,
        maybe_count: 1,
        unavailable_count: 1,
        score: 5,
        event_date: eventDate,
        start_time: null,
        label: 'C',
      },
      {
        slot_id: 99n,
        available_count: 0,
        maybe_count: 0,
        unavailable_count: 0,
        score: 0,
        event_date: eventDate,
        start_time: null,
        label: 'Z',
      },
    ];

    it('returns the deterministic best slot and per-slot tallies for the worked example', async () => {
      pollFindUnique.mockResolvedValue({ id: 1n });
      queryRaw.mockResolvedValue(sortedRows);

      const result = await service.getResults('tok');

      // A wins the score-6 tie via available_count (3 > 2); C is third.
      expect(result.best?.slotId).toBe(10n);
      expect(result.best?.score).toBe(6);
      expect(result.best?.date).toBe('2026-07-01');
      expect(result.best?.label).toBe('A');
      expect(result.slots[0].slotId).toBe(10n);
      expect(result.slots[1].slotId).toBe(11n);
      expect(result.slots[2].slotId).toBe(12n);
      // Counts and score coerce to numbers, even when SQL returns a string.
      expect(result.slots[0].available).toBe(3);
      expect(typeof result.slots[0].available).toBe('number');
      expect(result.slots[0].score).toBe(6);
      expect(typeof result.slots[0].score).toBe('number');
    });

    it('includes zero-response slots with all-zero tallies', async () => {
      pollFindUnique.mockResolvedValue({ id: 1n });
      queryRaw.mockResolvedValue(sortedRows);

      const result = await service.getResults('tok');

      const zero = result.slots.find((s) => s.slotId === 99n);
      expect(zero).toBeDefined();
      expect(zero).toMatchObject({
        available: 0,
        maybe: 0,
        unavailable: 0,
        score: 0,
      });
    });

    it('throws 404 for an unknown token and does not query tallies', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.getResults('bad')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
