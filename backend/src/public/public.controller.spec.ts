import { Test } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController', () => {
  let controller: PublicController;
  const findByPublicToken = jest.fn();

  beforeEach(async () => {
    findByPublicToken.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [{ provide: PublicService, useValue: { findByPublicToken } }],
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
});
