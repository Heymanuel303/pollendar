import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';
import { PollsService } from './polls.service';

const BASE64URL_22 = /^[A-Za-z0-9_-]{22}$/;

// Mocks whose call arguments are asserted carry explicit generics so `.mock.calls[0][0]` is typed
// (not `any`) — matching the convention in auth.service.spec.ts.
const pollCreate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollFindMany = jest.fn();
const pollFindFirst = jest.fn<Promise<unknown>, [unknown]>();
const pollFindUnique = jest.fn();
const pollUpdate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollDelete = jest.fn();
const pollDateDeleteMany = jest.fn();
const pollDateCreate = jest.fn<Promise<{ id: bigint }>, [unknown]>();

/** The interactive-tx handle handed to the `$transaction(fn)` callback. */
const tx = {
  poll: { create: pollCreate, update: pollUpdate, findUnique: pollFindUnique },
  pollDate: { deleteMany: pollDateDeleteMany, create: pollDateCreate },
};

const prisma: Partial<PrismaService> = {
  poll: {
    create: pollCreate,
    findMany: pollFindMany,
    findFirst: pollFindFirst,
    findUnique: pollFindUnique,
    update: pollUpdate,
    delete: pollDelete,
  } as never,
  pollDate: {
    deleteMany: pollDateDeleteMany,
    create: pollDateCreate,
  } as never,
  $transaction: jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ) as never,
};

const notFound = () =>
  new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
    code: 'P2025',
    clientVersion: 'test',
  });

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
    [
      pollCreate,
      pollFindMany,
      pollFindFirst,
      pollFindUnique,
      pollUpdate,
      pollDelete,
      pollDateDeleteMany,
      pollDateCreate,
    ].forEach((m) => m.mockReset());
    pollCreate.mockResolvedValue({ id: 5n });
    pollUpdate.mockResolvedValue({ id: 5n });
    pollDelete.mockResolvedValue({ id: 5n });
    pollDateDeleteMany.mockResolvedValue({ count: 0 });
    pollDateCreate.mockResolvedValue({ id: 1n });

    const moduleRef = await Test.createTestingModule({
      providers: [PollsService, { provide: PrismaService, useValue: prisma }],
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
                slots: {
                  create: { startTime: Date | null; endTime: Date | null }[];
                };
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
      const first = (
        pollCreate.mock.calls[0][0] as { data: { publicToken: string } }
      ).data.publicToken;
      const second = (
        pollCreate.mock.calls[1][0] as { data: { publicToken: string } }
      ).data.publicToken;
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

  describe('update', () => {
    it('patches scalar fields while the poll is open', async () => {
      pollFindUnique
        .mockResolvedValueOnce({ id: 5n, status: 'open' }) // initial load
        .mockResolvedValueOnce({ id: 5n, title: 'Updated', dates: [] }); // re-fetch

      const result = await service.update(5n, { title: 'Updated' });

      const patch = (pollUpdate.mock.calls[0][0] as { data: { title: string } })
        .data;
      expect(patch.title).toBe('Updated');
      expect(result).toEqual({ id: 5n, title: 'Updated', dates: [] });
      expect(pollDateDeleteMany).not.toHaveBeenCalled(); // no dates ⇒ nested untouched
    });

    it('rejects editing a non-open poll with 409', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'completed' });
      await expect(
        service.update(5n, { title: 'Nope' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(pollUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 when the poll no longer exists', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.update(5n, { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('replaces nested dates/slots: deletes existing before recreating', async () => {
      pollFindUnique
        .mockResolvedValueOnce({ id: 5n, status: 'open' })
        .mockResolvedValueOnce({ id: 5n, dates: [] });
      const dto: UpdatePollDto = {
        dates: [
          {
            eventDate: '2026-07-01',
            slots: [{ isAllDay: true, sortOrder: 0 }],
          },
        ],
      };

      await service.update(5n, dto);

      expect(pollDateDeleteMany).toHaveBeenCalledWith({
        where: { pollId: 5n },
      });
      expect(pollDateCreate).toHaveBeenCalledTimes(1);
      const created = (
        pollDateCreate.mock.calls[0][0] as {
          data: { pollId: bigint; slots: { create: unknown[] } };
        }
      ).data;
      expect(created.pollId).toBe(5n);
      expect(created.slots.create).toHaveLength(1);
      // deleteMany must run before create (cascade clears old slots first).
      expect(pollDateDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        pollDateCreate.mock.invocationCallOrder[0],
      );
    });

    it('rejects duplicate slots within a replaced date (NULLs the DB cannot dedupe)', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'open' });
      const dto: UpdatePollDto = {
        dates: [
          {
            eventDate: '2026-07-01',
            slots: [{ isAllDay: true }, { isAllDay: true }],
          },
        ],
      };
      await expect(service.update(5n, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(pollDateDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('cascade-deletes the poll by id', async () => {
      await service.remove(5n);
      expect(pollDelete).toHaveBeenCalledWith({ where: { id: 5n } });
    });

    it('translates a Prisma P2025 (record not found) into a 404', async () => {
      pollDelete.mockRejectedValue(notFound());
      await expect(service.remove(999n)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
