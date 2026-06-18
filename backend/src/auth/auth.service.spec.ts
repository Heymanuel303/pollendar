import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

interface LoginTokenCreateArg {
  data: {
    userId: bigint;
    tokenHash: string;
    expiresAt: Date;
    requestIp: string;
  };
}

interface UserUpsertArg {
  where: { email: string };
  update: Record<string, unknown>;
  create: { email: string; displayName: string };
}

const HEX64 = /^[0-9a-f]{64}$/;

describe('AuthService', () => {
  let service: AuthService;

  // requestMagicLink path (interactive transaction)
  const upsert = jest.fn<Promise<{ id: bigint }>, [UserUpsertArg]>();
  const create = jest.fn<Promise<unknown>, [LoginTokenCreateArg]>();
  const sendMagicLink = jest.fn<Promise<void>, [string, string]>();

  // verify/refresh/logout paths
  const loginTokenFindUnique = jest.fn();
  const loginTokenUpdate = jest.fn<
    Promise<unknown>,
    [{ where: { id: bigint }; data: { consumedAt: Date } }]
  >();
  const authSessionCreate = jest.fn<
    Promise<unknown>,
    [
      {
        data: {
          userId: bigint;
          refreshTokenHash: string;
          expiresAt: Date;
          userAgent: string | null;
          ip: string | null;
        };
      },
    ]
  >();
  const authSessionFindUnique = jest.fn();
  const authSessionUpdate = jest.fn<
    Promise<unknown>,
    [{ where: { id: bigint }; data: { revokedAt: Date } }]
  >();
  const authSessionUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [
      {
        where: { refreshTokenHash: string; revokedAt: null };
        data: { revokedAt: Date };
      },
    ]
  >();
  const signAsync = jest.fn<Promise<string>, [{ sub: string }, unknown]>();

  const config: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        MAGIC_LINK_TTL: '15m',
        REFRESH_TOKEN_TTL: '30d',
        APP_URL: 'http://localhost:5173',
      };
      return values[key];
    }) as never,
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL: '15m',
      };
      return values[key];
    }) as never,
  };

  const prisma: Partial<PrismaService> = {
    user: { upsert } as never,
    loginToken: {
      create,
      findUnique: loginTokenFindUnique,
      update: loginTokenUpdate,
    } as never,
    authSession: {
      create: authSessionCreate,
      findUnique: authSessionFindUnique,
      update: authSessionUpdate,
      updateMany: authSessionUpdateMany,
    } as never,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)({
            user: { upsert },
            loginToken: { create },
          })
        : Promise.all(arg as unknown[]),
    ) as never,
  };

  const validUser = {
    id: 1n,
    email: 'creator@example.com',
    displayName: 'creator',
    tokenVersion: 0,
  };

  beforeEach(async () => {
    [
      upsert,
      create,
      sendMagicLink,
      loginTokenFindUnique,
      loginTokenUpdate,
      authSessionCreate,
      authSessionFindUnique,
      authSessionUpdate,
      authSessionUpdateMany,
      signAsync,
    ].forEach((m) => m.mockReset());

    upsert.mockResolvedValue({ id: 1n });
    create.mockResolvedValue({});
    sendMagicLink.mockResolvedValue(undefined);
    loginTokenUpdate.mockResolvedValue({});
    authSessionCreate.mockResolvedValue({});
    authSessionUpdate.mockResolvedValue({});
    authSessionUpdateMany.mockResolvedValue({ count: 1 });
    signAsync.mockResolvedValue('jwt');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: { sendMagicLink } },
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: { signAsync } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('requestMagicLink', () => {
    it('upserts the user by email and stores only a hashed single-use token', async () => {
      const before = Date.now();
      await service.requestMagicLink('creator@example.com', '203.0.113.5');

      const upsertArg = upsert.mock.calls[0][0];
      expect(upsertArg.where).toEqual({ email: 'creator@example.com' });
      expect(upsertArg.create.email).toBe('creator@example.com');
      expect(upsertArg.create.displayName).toBe('creator');

      const createArg = create.mock.calls[0][0];
      expect(createArg.data.tokenHash).toMatch(HEX64);
      expect(createArg.data.requestIp).toBe('203.0.113.5');
      expect(createArg.data.expiresAt.getTime()).toBeGreaterThan(before);
    });

    it('emails a magic link with a 43-char base64url token and never persists the plain token', async () => {
      await service.requestMagicLink('creator@example.com', '203.0.113.5');

      expect(sendMagicLink).toHaveBeenCalledTimes(1);
      const [email, link] = sendMagicLink.mock.calls[0];
      expect(email).toBe('creator@example.com');

      const match = /\/auth\/callback\?token=([A-Za-z0-9_-]+)$/.exec(link);
      expect(match).not.toBeNull();
      const plainToken = match![1];
      expect(plainToken).toHaveLength(43);

      const createArg = create.mock.calls[0][0];
      expect(createArg.data.tokenHash).not.toBe(plainToken);
    });
  });

  describe('verify', () => {
    it('rejects an unknown token', async () => {
      loginTokenFindUnique.mockResolvedValue(null);
      await expect(service.verify('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authSessionCreate).not.toHaveBeenCalled();
    });

    it('rejects an already-consumed token', async () => {
      loginTokenFindUnique.mockResolvedValue({
        id: 7n,
        userId: 1n,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: validUser,
      });
      await expect(service.verify('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authSessionCreate).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      loginTokenFindUnique.mockResolvedValue({
        id: 7n,
        userId: 1n,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: validUser,
      });
      await expect(service.verify('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('consumes the token, creates a session storing only the sha256 hex, and returns tokens', async () => {
      loginTokenFindUnique.mockResolvedValue({
        id: 7n,
        userId: 1n,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: validUser,
      });

      const result = await service.verify('raw-token', {
        ip: '203.0.113.5',
        userAgent: 'jest',
      });

      // login token marked consumed
      const updateArg = loginTokenUpdate.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 7n });
      expect(updateArg.data.consumedAt).toBeInstanceOf(Date);

      // session created with a 64-char hex hash, never the raw refresh token
      const sessionArg = authSessionCreate.mock.calls[0][0];
      expect(sessionArg.data.userId).toBe(1n);
      expect(sessionArg.data.refreshTokenHash).toMatch(HEX64);
      expect(sessionArg.data.refreshTokenHash).not.toBe(result.refreshToken);
      expect(sessionArg.data.userAgent).toBe('jest');
      expect(sessionArg.data.ip).toBe('203.0.113.5');

      expect(result.accessToken).toBe('jwt');
      expect(result.user.id).toBe(1n);
      // access JWT carries the string-serialized id
      expect(signAsync.mock.calls[0][0]).toMatchObject({ sub: '1' });
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      authSessionFindUnique.mockResolvedValue(null);
      await expect(service.refresh('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a revoked session', async () => {
      authSessionFindUnique.mockResolvedValue({
        id: 3n,
        userId: 1n,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: validUser,
      });
      await expect(service.refresh('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired session', async () => {
      authSessionFindUnique.mockResolvedValue({
        id: 3n,
        userId: 1n,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: validUser,
      });
      await expect(service.refresh('raw', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rotates: revokes the old session and creates a fresh one', async () => {
      authSessionFindUnique.mockResolvedValue({
        id: 3n,
        userId: 1n,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: validUser,
      });

      const result = await service.refresh('old-raw', { ip: '203.0.113.5' });

      const revokeArg = authSessionUpdate.mock.calls[0][0];
      expect(revokeArg.where).toEqual({ id: 3n });
      expect(revokeArg.data.revokedAt).toBeInstanceOf(Date);

      const newSessionArg = authSessionCreate.mock.calls[0][0];
      expect(newSessionArg.data.refreshTokenHash).toMatch(HEX64);
      expect(newSessionArg.data.refreshTokenHash).not.toBe(result.refreshToken);

      expect(result.accessToken).toBe('jwt');
    });
  });

  describe('logout', () => {
    it('revokes the matching active session', async () => {
      await service.logout('some-raw');
      const arg = authSessionUpdateMany.mock.calls[0][0];
      expect(arg.where.refreshTokenHash).toMatch(HEX64);
      expect(arg.where.revokedAt).toBeNull();
      expect(arg.data.revokedAt).toBeInstanceOf(Date);
    });

    it('is a no-op (never throws) when no token is supplied', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(authSessionUpdateMany).not.toHaveBeenCalled();
    });
  });
});
