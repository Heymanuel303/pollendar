import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollsService } from './polls.service';

const BASE64URL_22 = /^[A-Za-z0-9_-]{22}$/;

const pollCreate = jest.fn();
const pollFindMany = jest.fn();
const pollFindFirst = jest.fn();

const prisma: Partial<PrismaService> = {
  poll: {
    create: pollCreate,
    findMany: pollFindMany,
    findFirst: pollFindFirst,
  } as never,
  $transaction: jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)({ poll: { create: pollCreate } })
      : Promise.all(arg as unknown[]),
  ) as never,
};

const tokenCollision = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: 'polls_public_token_key' },
  });

const validDto: CreatePollDto = {
  title: 'Team sync',
  dates: [
    {
      eventDate: '2026-07-01',
      slots: [{ startTime: '09:00', endTime: '10:00' }],
    },
  ],
};

describe('PollsService', () => {
  let service: PollsService;

  beforeEach(async () => {
    [pollCreate, pollFindMany, pollFindFirst].forEach((m) => m.mockReset());
    pollCreate.mockResolvedValue({ id: 5n });

    const moduleRef = await Test.createTestingModule({
      providers: [
        PollsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PollsService);
  });

  describe('create', () => {
    it('creates a poll with nested dates + slots in one transaction', async () => {
      await service.create(1n, validDto);

      const arg = pollCreate.mock.calls[0][0] as {
        data: {
          userId: bigint;
          publicToken: string;
          title: string;
          dates: {
            create: { eventDate: Date; slots: { create: unknown[] } }[];
          };
        };
      };
      expect(arg.data.userId).toBe(1n);
      expect(arg.data.title).toBe('Team sync');
      expect(arg.data.publicToken).toMatch(BASE64URL_22);
      expect(arg.data.dates.create).toHaveLength(1);
      expect(arg.data.dates.create[0].eventDate).toBeInstanceOf(Date);
      expect(arg.data.dates.create[0].slots.create).toHaveLength(1);
    });

    it('maps "HH:mm" slot times onto 1970 Date objects for @db.Time columns', async () => {
      await service.create(1n, validDto);
      const slot = (
        pollCreate.mock.calls[0][0] as {
          data: {
            dates: {
              create: {
                slots: { create: { startTime: Date | null; endTime: Date | null }[] };
              }[];
            };
          };
        }
      ).data.dates.create[0].slots.create[0];
      expect(slot.startTime).toBeInstanceOf(Date);
      expect((slot.startTime as Date).toISOString()).toBe(
        '1970-01-01T09:00:00.000Z',
      );
    });

    it('rejects duplicate slots within one date (NULLs that the DB cannot dedupe)', async () => {
      const dto: CreatePollDto = {
        title: 'All day',
        dates: [
          {
            eventDate: '2026-07-01',
            slots: [{ isAllDay: true }, { isAllDay: true }],
          },
        ],
      };
      await expect(service.create(1n, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(pollCreate).not.toHaveBeenCalled();
    });

    it('regenerates the token and retries on a public_token P2002 collision', async () => {
      pollCreate
        .mockRejectedValueOnce(tokenCollision())
        .mockResolvedValueOnce({ id: 5n });

      await service.create(1n, validDto);

      expect(pollCreate).toHaveBeenCalledTimes(2);
      const first = (pollCreate.mock.calls[0][0] as { data: { publicToken: string } })
        .data.publicToken;
      const second = (pollCreate.mock.calls[1][0] as { data: { publicToken: string } })
        .data.publicToken;
      expect(first).not.toBe(second);
    });

    it('gives up after MAX attempts of persistent token collisions', async () => {
      pollCreate.mockRejectedValue(tokenCollision());
      await expect(service.create(1n, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(pollCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('findAllForUser', () => {
    it('scopes the query to the owner, newest first', async () => {
      pollFindMany.mockResolvedValue([]);
      await service.findAllForUser(7n);
      expect(pollFindMany).toHaveBeenCalledWith({
        where: { userId: 7n },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOneForUser', () => {
    it('returns the owned poll with nested dates → slots', async () => {
      const poll = { id: 3n, dates: [] };
      pollFindFirst.mockResolvedValue(poll);

      const result = await service.findOneForUser(7n, 3n);

      expect(result).toBe(poll);
      const arg = pollFindFirst.mock.calls[0][0] as { where: unknown };
      expect(arg.where).toEqual({ id: 3n, userId: 7n });
    });

    it('throws 404 when the poll is not owned or missing (no existence leak)', async () => {
      pollFindFirst.mockResolvedValue(null);
      await expect(service.findOneForUser(7n, 999n)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
