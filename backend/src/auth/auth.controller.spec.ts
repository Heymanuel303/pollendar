import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookie.util';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;
  const requestMagicLink = jest.fn<Promise<void>, [string, string]>();
  const verify = jest.fn();
  const refresh = jest.fn();
  const logout = jest.fn<Promise<void>, [string | undefined]>();

  const config: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        COOKIE_SECURE: false,
        COOKIE_DOMAIN: 'localhost',
      };
      return values[key];
    }) as never,
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        ACCESS_TOKEN_TTL: '15m',
        REFRESH_TOKEN_TTL: '30d',
      };
      return values[key];
    }) as never,
  };

  const buildReq = (overrides: Partial<Request> = {}): Request =>
    ({ headers: {}, ip: '203.0.113.5', cookies: {}, ...overrides }) as Request;

  type CookieMock = jest.Mock<unknown, [string, string, unknown]>;
  const buildRes = () =>
    ({
      cookie: jest.fn() as CookieMock,
      clearCookie: jest.fn() as CookieMock,
    }) as unknown as Response & {
      cookie: CookieMock;
      clearCookie: CookieMock;
    };

  beforeEach(async () => {
    requestMagicLink.mockReset().mockResolvedValue(undefined);
    verify.mockReset();
    refresh.mockReset();
    logout.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { requestMagicLink, verify, refresh, logout },
        },
        { provide: ConfigService, useValue: config },
      ],
    })
      // me() is unit-tested by calling it directly; the guard's behaviour has its own spec.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AuthController);
  });

  describe('requestMagicLink', () => {
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

  describe('verify', () => {
    it('sets httpOnly access + refresh cookies and returns the user id as a string', async () => {
      verify.mockResolvedValue({
        user: { id: 42n, email: 'creator@example.com', displayName: 'creator' },
        accessToken: 'access.jwt',
        refreshToken: 'raw-refresh',
      });
      const res = buildRes();

      const result = await controller.verify(
        { token: 'raw-token' },
        buildReq({
          headers: { 'user-agent': 'jest' },
        } as Partial<Request>),
        res,
      );

      expect(verify).toHaveBeenCalledWith('raw-token', {
        ip: '203.0.113.5',
        userAgent: 'jest',
      });
      expect(result).toEqual({
        user: {
          id: '42',
          email: 'creator@example.com',
          displayName: 'creator',
        },
      });

      const accessCall = res.cookie.mock.calls.find(
        (c) => c[0] === ACCESS_COOKIE,
      );
      const refreshCall = res.cookie.mock.calls.find(
        (c) => c[0] === REFRESH_COOKIE,
      );
      expect(accessCall?.[1]).toBe('access.jwt');
      expect(accessCall?.[2]).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
      });
      expect(refreshCall?.[1]).toBe('raw-refresh');
      expect(refreshCall?.[2]).toMatchObject({ httpOnly: true });
    });
  });

  describe('refresh', () => {
    it('rotates and re-sets both cookies when a refresh cookie is present', async () => {
      refresh.mockResolvedValue({
        accessToken: 'new.access',
        refreshToken: 'new-refresh',
      });
      const res = buildRes();

      const result = await controller.refresh(
        buildReq({
          cookies: { [REFRESH_COOKIE]: 'old-refresh' },
        } as Partial<Request>),
        res,
      );

      expect(refresh).toHaveBeenCalledWith('old-refresh', {
        ip: '203.0.113.5',
        userAgent: undefined,
      });
      expect(result).toEqual({ ok: true });
      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_COOKIE,
        'new.access',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        'new-refresh',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('throws 401 when the refresh cookie is missing', async () => {
      const res = buildRes();
      await expect(
        controller.refresh(buildReq({ cookies: {} } as Partial<Request>), res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('maps the guard-attached user to a wire shape with id as a string', () => {
      const user = {
        id: BigInt(42),
        email: 'creator@example.com',
        displayName: null,
        tokenVersion: 0,
      } as User;

      expect(controller.me(user)).toEqual({
        id: '42',
        email: 'creator@example.com',
        displayName: null,
      });
    });
  });

  describe('logout', () => {
    it('clears both cookies and returns { ok: true }', async () => {
      const res = buildRes();
      const result = await controller.logout(
        buildReq({
          cookies: { [REFRESH_COOKIE]: 'some-refresh' },
        } as Partial<Request>),
        res,
      );

      expect(logout).toHaveBeenCalledWith('some-refresh');
      expect(result).toEqual({ ok: true });
      expect(res.clearCookie).toHaveBeenCalledWith(
        ACCESS_COOKIE,
        expect.anything(),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        expect.anything(),
      );
    });

    it('is idempotent when no refresh cookie is present', async () => {
      const res = buildRes();
      const result = await controller.logout(
        buildReq({ cookies: {} } as Partial<Request>),
        res,
      );
      expect(logout).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ ok: true });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });
});
