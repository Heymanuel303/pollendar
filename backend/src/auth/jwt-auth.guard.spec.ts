import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE } from './cookie.util';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const findUnique = jest.fn();

  const jwt = { verifyAsync } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn(() => 'access-secret'),
  } as unknown as ConfigService;
  const prisma = {
    user: { findUnique },
  } as unknown as PrismaService;

  const guard = new JwtAuthGuard(jwt, config, prisma);

  const buildUser = (overrides: Partial<User> = {}): User =>
    ({
      id: BigInt(1),
      email: 'creator@example.com',
      displayName: 'creator',
      tokenVersion: 0,
      ...overrides,
    }) as User;

  const buildCtx = (cookies: Record<string, string> | undefined) => {
    const req = { cookies } as unknown as Request;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, ctx };
  };

  beforeEach(() => {
    verifyAsync.mockReset();
    findUnique.mockReset();
  });

  it('resolves true and attaches req.user for a valid token with matching tokenVersion', async () => {
    verifyAsync.mockResolvedValue({
      sub: '1',
      email: 'creator@example.com',
      tokenVersion: 0,
    });
    const user = buildUser();
    findUnique.mockResolvedValue(user);
    const { req, ctx } = buildCtx({ [ACCESS_COOKIE]: 'good.jwt' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: BigInt(1) } });
    expect((req as Request & { user: User }).user).toBe(user);
  });

  it('rejects with 401 when the access cookie is missing', async () => {
    const { ctx } = buildCtx({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the cookies object is absent', async () => {
    const { ctx } = buildCtx(undefined);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when verifyAsync throws (bad/tampered token)', async () => {
    verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const { ctx } = buildCtx({ [ACCESS_COOKIE]: 'not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the user no longer exists', async () => {
    verifyAsync.mockResolvedValue({
      sub: '1',
      email: 'creator@example.com',
      tokenVersion: 0,
    });
    findUnique.mockResolvedValue(null);
    const { ctx } = buildCtx({ [ACCESS_COOKIE]: 'good.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when tokenVersion is stale (bumped since issue)', async () => {
    verifyAsync.mockResolvedValue({
      sub: '1',
      email: 'creator@example.com',
      tokenVersion: 0,
    });
    findUnique.mockResolvedValue(buildUser({ tokenVersion: 1 }));
    const { req, ctx } = buildCtx({ [ACCESS_COOKIE]: 'stale.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect((req as Request & { user?: User }).user).toBeUndefined();
  });
});
