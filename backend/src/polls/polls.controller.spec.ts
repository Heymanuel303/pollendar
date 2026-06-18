import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';

describe('PollsController', () => {
  let controller: PollsController;
  const create = jest.fn();
  const findAllForUser = jest.fn();
  const findOneForUser = jest.fn();

  const config: Partial<ConfigService> = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = { APP_URL: 'https://app.example' };
      return values[key];
    }) as never,
  };

  const user = { id: 42n } as User;

  const dto: CreatePollDto = {
    title: 'Team sync',
    dates: [{ eventDate: '2026-07-01', slots: [{ startTime: '09:00' }] }],
  };

  beforeEach(async () => {
    [create, findAllForUser, findOneForUser].forEach((m) => m.mockReset());

    const moduleRef = await Test.createTestingModule({
      controllers: [PollsController],
      providers: [
        {
          provide: PollsService,
          useValue: { create, findAllForUser, findOneForUser },
        },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(PollsController);
  });

  describe('create', () => {
    it('returns the thin share shape with a shareUrl built from APP_URL', async () => {
      create.mockResolvedValue({
        id: 5n,
        publicToken: 'abcdefghijklmnopqrstuv',
        title: 'Team sync',
        status: 'open',
      });

      const result = await controller.create(user, dto);

      expect(create).toHaveBeenCalledWith(42n, dto);
      expect(result).toEqual({
        id: 5n,
        publicToken: 'abcdefghijklmnopqrstuv',
        shareUrl: 'https://app.example/p/abcdefghijklmnopqrstuv',
        title: 'Team sync',
        status: 'open',
      });
    });
  });

  describe('list', () => {
    it('delegates to findAllForUser scoped to the caller', () => {
      const polls = [{ id: 1n }];
      findAllForUser.mockReturnValue(polls);
      expect(controller.list(user)).toBe(polls);
      expect(findAllForUser).toHaveBeenCalledWith(42n);
    });
  });

  describe('findOne', () => {
    it('parses the path id to BigInt and delegates to findOneForUser', () => {
      const poll = { id: 3n };
      findOneForUser.mockReturnValue(poll);
      expect(controller.findOne(user, '3')).toBe(poll);
      expect(findOneForUser).toHaveBeenCalledWith(42n, 3n);
    });

    it('throws 404 for a non-numeric id (no existence leak)', () => {
      expect(() => controller.findOne(user, 'not-a-number')).toThrow(
        NotFoundException,
      );
      expect(findOneForUser).not.toHaveBeenCalled();
    });
  });
});
