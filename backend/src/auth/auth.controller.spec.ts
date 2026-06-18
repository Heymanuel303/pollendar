import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const requestMagicLink = jest.fn<Promise<void>, [string, string]>();

  const buildReq = (overrides: Partial<Request> = {}): Request =>
    ({ headers: {}, ip: '203.0.113.5', ...overrides }) as Request;

  beforeEach(async () => {
    requestMagicLink.mockReset();
    requestMagicLink.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { requestMagicLink } }],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('returns { ok: true } for a known email', async () => {
    const result = await controller.requestMagicLink(
      { email: 'creator@example.com' },
      buildReq(),
    );
    expect(result).toEqual({ ok: true });
    expect(requestMagicLink).toHaveBeenCalledWith(
      'creator@example.com',
      '203.0.113.5',
    );
  });

  it('returns { ok: true } for an unknown email (no enumeration)', async () => {
    const result = await controller.requestMagicLink(
      { email: 'nobody@example.com' },
      buildReq(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('prefers the first x-forwarded-for hop for the client IP', async () => {
    await controller.requestMagicLink(
      { email: 'creator@example.com' },
      buildReq({
        headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.5' },
      } as Partial<Request>),
    );
    expect(requestMagicLink).toHaveBeenCalledWith(
      'creator@example.com',
      '198.51.100.7',
    );
  });
});
