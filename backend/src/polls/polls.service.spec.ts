import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
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
const pollFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const pollUpdate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollDelete = jest.fn();
const pollDateDeleteMany = jest.fn();
const pollDateCreate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollDateUpdate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollDateFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const pollSlotFindUnique = jest.fn();
const pollSlotUpdate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollSlotCreate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const pollSlotUpdateMany = jest.fn();
const responseCount = jest.fn<Promise<number>, [unknown]>();
const slotTallyUpsert = jest.fn();
const queryRaw = jest.fn<Promise<unknown[]>, [unknown]>();
const notifyPollCompleted = jest.fn<Promise<void>, [bigint]>();

/** The interactive-tx handle handed to the `$transaction(fn)` callback. */
const tx = {
  poll: { create: pollCreate, update: pollUpdate, findUnique: pollFindUnique },
  pollDate: {
    deleteMany: pollDateDeleteMany,
    create: pollDateCreate,
    update: pollDateUpdate,
    findMany: pollDateFindMany,
  },
  pollSlot: {
    findUnique: pollSlotFindUnique,
    update: pollSlotUpdate,
    create: pollSlotCreate,
    updateMany: pollSlotUpdateMany,
  },
  response: { count: responseCount },
  slotTally: { upsert: slotTallyUpsert },
  $queryRaw: queryRaw,
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
    update: pollDateUpdate,
    findMany: pollDateFindMany,
  } as never,
  pollSlot: {
    findUnique: pollSlotFindUnique,
    update: pollSlotUpdate,
    create: pollSlotCreate,
    updateMany: pollSlotUpdateMany,
  } as never,
  response: { count: responseCount } as never,
  slotTally: { upsert: slotTallyUpsert } as never,
  $transaction: jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ) as never,
};

const config: Partial<ConfigService> = {
  getOrThrow: jest.fn((key: string) => {
    const values: Record<string, string> = { APP_URL: 'https://app.example' };
    return values[key];
  }) as never,
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
      pollDateUpdate,
      pollDateFindMany,
      pollSlotFindUnique,
      pollSlotUpdate,
      pollSlotCreate,
      pollSlotUpdateMany,
      responseCount,
      slotTallyUpsert,
      queryRaw,
      notifyPollCompleted,
    ].forEach((m) => m.mockReset());
    pollCreate.mockResolvedValue({ id: 5n });
    pollUpdate.mockResolvedValue({ id: 5n });
    pollDelete.mockResolvedValue({ id: 5n });
    pollDateDeleteMany.mockResolvedValue({ count: 0 });
    pollDateCreate.mockResolvedValue({ id: 1n });
    pollDateUpdate.mockResolvedValue({ id: 1n });
    pollDateFindMany.mockResolvedValue([]);
    pollSlotUpdate.mockResolvedValue({ id: 1n });
    pollSlotCreate.mockResolvedValue({ id: 1n });
    pollSlotUpdateMany.mockResolvedValue({ count: 0 });
    // Default to the zero-vote fast path so existing update tests keep their destructive-replace
    // behaviour; has-votes tests override this per-case.
    responseCount.mockResolvedValue(0);
    slotTallyUpsert.mockResolvedValue({});
    queryRaw.mockResolvedValue([]);
    notifyPollCompleted.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PollsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        {
          provide: NotificationsService,
          useValue: { notifyPollCompleted },
        },
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
      const arg = pollFindFirst.mock.calls[0][0] as {
        where: unknown;
        include: {
          dates: { include: { slots: { include: unknown } } };
        };
      };
      expect(arg.where).toEqual({ id: 3n, userId: 7n });
      // The editor relies on per-slot vote counts to lock voted slots.
      expect(arg.include.dates.include.slots.include).toEqual({
        _count: { select: { responses: true } },
      });
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

    describe('has-votes diff path (response.count >= 1)', () => {
      /** An existing date with one active, voted slot — the common diff fixture. */
      const existingDate = (overrides?: {
        slots?: Array<{
          id: bigint;
          startTime: Date | null;
          endTime: Date | null;
          isAllDay: boolean;
          label: string | null;
          sortOrder: number | null;
          invalidatedAt: Date | null;
          _count: { responses: number };
        }>;
      }) => ({
        id: 10n,
        eventDate: new Date('2026-07-01T00:00:00.000Z'),
        sortOrder: 0,
        invalidatedAt: null,
        slots: overrides?.slots ?? [
          {
            id: 100n,
            startTime: new Date('1970-01-01T09:00:00.000Z'),
            endTime: new Date('1970-01-01T10:00:00.000Z'),
            isAllDay: false,
            label: null,
            sortOrder: 0,
            invalidatedAt: null,
            _count: { responses: 2 },
          },
        ],
      });

      beforeEach(() => {
        responseCount.mockResolvedValue(1);
        pollFindUnique
          .mockResolvedValueOnce({ id: 5n, status: 'open' })
          .mockResolvedValueOnce({ id: 5n, dates: [] });
      });

      it('NEVER deletes and soft-invalidates an incoming slot carrying invalidatedAt', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [
                {
                  id: '100',
                  startTime: '09:00',
                  endTime: '10:00',
                  invalidatedAt: '2026-06-19T12:00:00.000Z',
                },
              ],
            },
          ],
        };

        await service.update(5n, dto);

        expect(pollDateDeleteMany).not.toHaveBeenCalled();
        const arg = pollSlotUpdate.mock.calls[0][0] as {
          where: { id: bigint };
          data: { invalidatedAt: Date };
        };
        expect(arg.where.id).toBe(100n);
        expect(arg.data.invalidatedAt).toBeInstanceOf(Date);
      });

      it('invalidates a date via its in-payload marker and cascades to active slots', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              invalidatedAt: '2026-06-19T12:00:00.000Z',
              slots: [{ id: '100', startTime: '09:00', endTime: '10:00' }],
            },
          ],
        };

        await service.update(5n, dto);

        const dateArg = pollDateUpdate.mock.calls[0][0] as {
          where: { id: bigint };
          data: { invalidatedAt: Date };
        };
        expect(dateArg.where.id).toBe(10n);
        expect(dateArg.data.invalidatedAt).toBeInstanceOf(Date);
        // The date's still-active slots are cascaded in one updateMany, not per-slot.
        expect(pollSlotUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { pollDateId: 10n, invalidatedAt: null },
          }),
        );
        // Per-slot reconciliation is skipped — slot 100 is never individually updated/deleted.
        expect(pollSlotUpdate).not.toHaveBeenCalled();
        expect(pollDateDeleteMany).not.toHaveBeenCalled();
      });

      it('throws 409 when editing a VOTED slot in place (no scalar update, no delete)', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [
                { id: '100', startTime: '11:00', endTime: '12:00' }, // changed times
              ],
            },
          ],
        };

        await expect(service.update(5n, dto)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(pollSlotUpdate).not.toHaveBeenCalled();
        expect(pollDateDeleteMany).not.toHaveBeenCalled();
      });

      it('succeeds when adding a NEW date while re-sending an UNTOUCHED voted slot verbatim (no sortOrder)', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              // Re-sent byte-identical, WITHOUT any sortOrder key — must be a no-op.
              slots: [{ id: '100', startTime: '09:00', endTime: '10:00' }],
            },
            {
              // Brand-new date (no id) — the trigger that forces the diff path.
              eventDate: '2026-07-08',
              slots: [{ startTime: '14:00', endTime: '15:00' }],
            },
          ],
        };

        await expect(service.update(5n, dto)).resolves.not.toThrow();

        // The untouched voted slot is a no-op: never updated, never deleted.
        expect(pollSlotUpdate).not.toHaveBeenCalled();
        expect(pollDateDeleteMany).not.toHaveBeenCalled();
        // The brand-new date is created.
        expect(pollDateCreate).toHaveBeenCalledTimes(1);
        const created = (
          pollDateCreate.mock.calls[0][0] as {
            data: { eventDate: Date; slots: { create: unknown[] } };
          }
        ).data;
        expect(created.eventDate).toBeInstanceOf(Date);
        expect(created.slots.create).toHaveLength(1);
      });

      it('edits a ZERO-vote slot in place via pollSlot.update of scalars', async () => {
        pollDateFindMany.mockResolvedValue([
          existingDate({
            slots: [
              {
                id: 100n,
                startTime: new Date('1970-01-01T09:00:00.000Z'),
                endTime: new Date('1970-01-01T10:00:00.000Z'),
                isAllDay: false,
                label: null,
                sortOrder: 0,
                invalidatedAt: null,
                _count: { responses: 0 },
              },
            ],
          }),
        ]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [{ id: '100', startTime: '11:00', endTime: '12:00' }],
            },
          ],
        };

        await service.update(5n, dto);

        const arg = pollSlotUpdate.mock.calls[0][0] as {
          where: { id: bigint };
          data: { startTime: Date | null };
        };
        expect(arg.where.id).toBe(100n);
        expect(arg.data.startTime).toBeInstanceOf(Date);
      });

      it('reactivates a previously-invalidated slot (marker null) via invalidatedAt: null', async () => {
        pollDateFindMany.mockResolvedValue([
          existingDate({
            slots: [
              {
                id: 100n,
                startTime: new Date('1970-01-01T09:00:00.000Z'),
                endTime: new Date('1970-01-01T10:00:00.000Z'),
                isAllDay: false,
                label: null,
                sortOrder: 0,
                invalidatedAt: new Date('2026-06-18T00:00:00.000Z'),
                _count: { responses: 3 },
              },
            ],
          }),
        ]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [{ id: '100', startTime: '09:00', endTime: '10:00' }],
            },
          ],
        };

        await service.update(5n, dto);

        const arg = pollSlotUpdate.mock.calls[0][0] as {
          where: { id: bigint };
          data: { invalidatedAt: Date | null };
        };
        expect(arg.where.id).toBe(100n);
        expect(arg.data.invalidatedAt).toBeNull();
      });

      it('soft-invalidates an existing slot omitted from the incoming date (never deletes)', async () => {
        pollDateFindMany.mockResolvedValue([
          existingDate({
            slots: [
              {
                id: 100n,
                startTime: new Date('1970-01-01T09:00:00.000Z'),
                endTime: new Date('1970-01-01T10:00:00.000Z'),
                isAllDay: false,
                label: null,
                sortOrder: 0,
                invalidatedAt: null,
                _count: { responses: 0 },
              },
              {
                id: 101n,
                startTime: new Date('1970-01-01T11:00:00.000Z'),
                endTime: new Date('1970-01-01T12:00:00.000Z'),
                isAllDay: false,
                label: null,
                sortOrder: 1,
                invalidatedAt: null,
                _count: { responses: 0 },
              },
            ],
          }),
        ]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [{ id: '100', startTime: '09:00', endTime: '10:00' }],
            },
          ],
        };

        await service.update(5n, dto);

        // The omitted slot 101 is soft-invalidated with a Date, never deleted.
        const invalidateCall = pollSlotUpdate.mock.calls.find(
          (c) => (c[0] as { where: { id: bigint } }).where.id === 101n,
        );
        expect(invalidateCall).toBeDefined();
        expect(
          (invalidateCall![0] as { data: { invalidatedAt: Date } }).data
            .invalidatedAt,
        ).toBeInstanceOf(Date);
      });

      it('soft-invalidates a whole date omitted from the payload AND its active slots', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              eventDate: '2026-08-01', // a brand-new date, the old one (id 10) is absent
              slots: [{ startTime: '09:00', endTime: '10:00' }],
            },
          ],
        };

        await service.update(5n, dto);

        const dateInvalidate = pollDateUpdate.mock.calls.find(
          (c) => (c[0] as { where: { id: bigint } }).where.id === 10n,
        );
        expect(dateInvalidate).toBeDefined();
        expect(
          (dateInvalidate![0] as { data: { invalidatedAt: Date } }).data
            .invalidatedAt,
        ).toBeInstanceOf(Date);
        // Active child slots of the removed date are invalidated via updateMany.
        expect(pollSlotUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { pollDateId: 10n, invalidatedAt: null },
          }),
        );
      });

      it('throws 400 when an incoming id does not belong to the poll', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '999', // no such date on this poll
              eventDate: '2026-07-01',
              slots: [{ id: '100', startTime: '09:00', endTime: '10:00' }],
            },
          ],
        };

        await expect(service.update(5n, dto)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(pollDateDeleteMany).not.toHaveBeenCalled();
      });

      it('recomputes the slot tally cache via upsert after a diff', async () => {
        pollDateFindMany.mockResolvedValue([existingDate()]);
        queryRaw.mockResolvedValue([
          {
            id: 100n,
            available_count: 2,
            maybe_count: 0,
            unavailable_count: 0,
            score: 4,
          },
        ]);
        const dto: UpdatePollDto = {
          dates: [
            {
              id: '10',
              eventDate: '2026-07-01',
              slots: [
                {
                  id: '100',
                  startTime: '09:00',
                  endTime: '10:00',
                  sortOrder: 0,
                },
              ],
            },
          ],
        };

        await service.update(5n, dto);

        expect(slotTallyUpsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { pollSlotId: 100n } }),
        );
      });
    });
  });

  /**
   * Regression guard for the cancel/reopen-stale-UI bug: every owned-poll-returning path must
   * request the nested dates → slots scaffold. A flat row wipes `currentPoll.dates` on the client,
   * leaving the availability grid + who's-coming matrix blank until a full page reload.
   */
  const expectDetailInclude = (call: unknown): void => {
    const include = (
      call as {
        include?: { dates?: { include?: { slots?: { include?: unknown } } } };
      }
    ).include;
    expect(include?.dates?.include?.slots?.include).toEqual({
      _count: { select: { responses: true } },
    });
  };

  describe('cancel', () => {
    it('transitions an open poll to cancelled (returning the nested dates scaffold)', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'open' });
      pollUpdate.mockResolvedValue({ id: 5n, status: 'cancelled', dates: [] });

      const result = await service.cancel(5n);

      const patch = (
        pollUpdate.mock.calls[0][0] as { data: { status: string } }
      ).data;
      expect(patch.status).toBe('cancelled');
      expectDetailInclude(pollUpdate.mock.calls[0][0]);
      expect(result).toEqual({ id: 5n, status: 'cancelled', dates: [] });
    });

    it('is idempotent for an already-cancelled poll (no second update) and still returns dates', async () => {
      const poll = { id: 5n, status: 'cancelled', dates: [] };
      pollFindUnique.mockResolvedValue(poll);

      const result = await service.cancel(5n);

      expect(result).toBe(poll);
      expect(pollUpdate).not.toHaveBeenCalled();
      expectDetailInclude(pollFindUnique.mock.calls[0][0]);
    });

    it('rejects cancelling a completed poll with 409', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'completed' });
      await expect(service.cancel(5n)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(pollUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 when the poll is missing', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.cancel(999n)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reopen', () => {
    it('transitions a cancelled poll to open (returning the nested dates scaffold)', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'cancelled' });
      pollUpdate.mockResolvedValue({ id: 5n, status: 'open', dates: [] });

      const result = await service.reopen(5n);

      const patch = (
        pollUpdate.mock.calls[0][0] as { data: { status: string } }
      ).data;
      expect(patch.status).toBe('open');
      expectDetailInclude(pollUpdate.mock.calls[0][0]);
      expect(result).toEqual({ id: 5n, status: 'open', dates: [] });
    });

    it('clears finalSlotId + completedAt when reopening a completed poll', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'completed' });
      pollUpdate.mockResolvedValue({ id: 5n, status: 'open' });

      await service.reopen(5n);

      const patch = (
        pollUpdate.mock.calls[0][0] as {
          data: { status: string; finalSlotId: null; completedAt: null };
        }
      ).data;
      expect(patch.status).toBe('open');
      expect(patch.finalSlotId).toBeNull();
      expect(patch.completedAt).toBeNull();
    });

    it('is idempotent for an already-open poll (no second update) and still returns dates', async () => {
      const poll = { id: 5n, status: 'open', dates: [] };
      pollFindUnique.mockResolvedValue(poll);

      const result = await service.reopen(5n);

      expect(result).toBe(poll);
      expect(pollUpdate).not.toHaveBeenCalled();
      expectDetailInclude(pollFindUnique.mock.calls[0][0]);
    });

    it('throws 404 when the poll is missing', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.reopen(999n)).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

  describe('complete', () => {
    it('transitions an open poll to completed and fans out notifications (returning the nested dates scaffold)', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'open' });
      pollSlotFindUnique.mockResolvedValue({ id: 9n, date: { pollId: 5n } });
      pollUpdate.mockResolvedValue({
        id: 5n,
        status: 'completed',
        finalSlotId: 9n,
        dates: [],
      });

      const result = await service.complete(5n, 9n);

      const patch = (
        pollUpdate.mock.calls[0][0] as {
          data: { status: string; finalSlotId: bigint; completedAt: Date };
        }
      ).data;
      expect(patch.status).toBe('completed');
      expect(patch.finalSlotId).toBe(9n);
      expect(patch.completedAt).toBeInstanceOf(Date);
      expectDetailInclude(pollUpdate.mock.calls[0][0]);
      expect(notifyPollCompleted).toHaveBeenCalledWith(5n);
      expect(result).toEqual({
        id: 5n,
        status: 'completed',
        finalSlotId: 9n,
        dates: [],
      });
    });

    it('rejects a slot from another poll with 400 and does not update', async () => {
      pollFindUnique.mockResolvedValue({ id: 5n, status: 'open' });
      pollSlotFindUnique.mockResolvedValue({ id: 9n, date: { pollId: 99n } });

      await expect(service.complete(5n, 9n)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pollUpdate).not.toHaveBeenCalled();
      expect(notifyPollCompleted).not.toHaveBeenCalled();
    });

    it('is idempotent: an already-completed poll is not re-updated or re-notified (still returns dates)', async () => {
      pollFindUnique.mockResolvedValue({
        id: 5n,
        status: 'completed',
        dates: [],
      });
      pollSlotFindUnique.mockResolvedValue({ id: 9n, date: { pollId: 5n } });

      const result = await service.complete(5n, 9n);

      expect(result).toEqual({ id: 5n, status: 'completed', dates: [] });
      expect(pollUpdate).not.toHaveBeenCalled();
      expect(notifyPollCompleted).not.toHaveBeenCalled();
      expectDetailInclude(pollFindUnique.mock.calls[0][0]);
    });
  });

  describe('buildInviteMessage', () => {
    it('returns a message containing the share URL built from APP_URL', async () => {
      pollFindUnique.mockResolvedValue({
        id: 5n,
        title: 'Team sync',
        publicToken: 'abcdefghijklmnopqrstuv',
      });

      const result = await service.buildInviteMessage(5n);

      expect(result.shareUrl).toBe(
        'https://app.example/p/abcdefghijklmnopqrstuv',
      );
      expect(result.message).toContain('Team sync');
      expect(result.message).toContain(result.shareUrl);
    });

    it('throws 404 when the poll is missing', async () => {
      pollFindUnique.mockResolvedValue(null);
      await expect(service.buildInviteMessage(999n)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
