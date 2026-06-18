import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PublicService } from './public.service';

const pollFindUnique = jest.fn<Promise<unknown>, [unknown]>();

const prisma: Partial<PrismaService> = {
  poll: { findUnique: pollFindUnique } as never,
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
      const serialized = JSON.stringify(result, (_k, v) =>
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
});
