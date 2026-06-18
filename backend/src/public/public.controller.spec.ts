import { Test } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController', () => {
  let controller: PublicController;
  const findByPublicToken = jest.fn();
  const getParticipantResponses = jest.fn();

  beforeEach(async () => {
    findByPublicToken.mockReset();
    getParticipantResponses.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        {
          provide: PublicService,
          useValue: { findByPublicToken, getParticipantResponses },
        },
      ],
    }).compile();
    controller = moduleRef.get(PublicController);
  });

  it('delegates getPoll to PublicService.findByPublicToken and returns its value', () => {
    const poll = { id: 3n, title: 'Team sync' };
    findByPublicToken.mockReturnValue(poll);

    const result = controller.getPoll('tok');

    expect(findByPublicToken).toHaveBeenCalledWith('tok');
    expect(result).toBe(poll);
  });

  it('delegates getParticipantResponses with numeric limit/offset and returns its value', () => {
    const value = { participants: [], total: 0, hasMore: false };
    getParticipantResponses.mockReturnValue(value);

    const result = controller.getParticipantResponses('tok', '50', '10');

    expect(getParticipantResponses).toHaveBeenCalledWith('tok', 50, 10);
    expect(result).toBe(value);
  });

  it('passes undefined for omitted limit/offset', () => {
    void controller.getParticipantResponses('tok');

    expect(getParticipantResponses).toHaveBeenCalledWith(
      'tok',
      undefined,
      undefined,
    );
  });

  // `@Throttle({ default: { limit, ttl } })` writes `THROTTLER:LIMIT` + name on the method via
  // Reflect (see @nestjs/throttler throttler.decorator). The only write endpoint on the public
  // surface (`submit`) carries a tighter per-IP limit; the read getters keep the global default.
  describe('throttling', () => {
    const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';

    function handlerOf(
      name: 'submit' | 'getResults' | 'getPoll' | 'getParticipantResponses',
    ): object {
      const descriptor = Object.getOwnPropertyDescriptor(
        PublicController.prototype,
        name,
      );
      return descriptor?.value as object;
    }

    it('puts a per-handler throttle limit on submit', () => {
      const limit: unknown = Reflect.getMetadata(
        THROTTLER_LIMIT_DEFAULT,
        handlerOf('submit'),
      );
      expect(limit).toBe(10);
    });

    it('leaves the read getters on the global throttle default', () => {
      expect(
        Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handlerOf('getResults')),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handlerOf('getPoll')),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(
          THROTTLER_LIMIT_DEFAULT,
          handlerOf('getParticipantResponses'),
        ),
      ).toBeUndefined();
    });
  });
});
