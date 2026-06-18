import { ConfigService } from '@nestjs/config';
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

describe('AuthService', () => {
  let service: AuthService;
  const upsert = jest.fn<Promise<{ id: bigint }>, [UserUpsertArg]>();
  const create = jest.fn<Promise<unknown>, [LoginTokenCreateArg]>();
  const sendMagicLink = jest.fn<Promise<void>, [string, string]>();

  const config: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        MAGIC_LINK_TTL: '15m',
        APP_URL: 'http://localhost:5173',
      };
      return values[key];
    }) as never,
  };

  const prisma: Partial<PrismaService> = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ user: { upsert }, loginToken: { create } }),
    ) as never,
  };

  beforeEach(async () => {
    upsert.mockReset();
    create.mockReset();
    sendMagicLink.mockReset();
    upsert.mockResolvedValue({ id: 1n });
    create.mockResolvedValue({});
    sendMagicLink.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: { sendMagicLink } },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('upserts the user by email and stores only a hashed single-use token', async () => {
    const before = Date.now();
    await service.requestMagicLink('creator@example.com', '203.0.113.5');

    const upsertArg = upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ email: 'creator@example.com' });
    expect(upsertArg.create.email).toBe('creator@example.com');
    expect(upsertArg.create.displayName).toBe('creator');

    const createArg = create.mock.calls[0][0];
    expect(createArg.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(createArg.data.requestIp).toBe('203.0.113.5');
    // 15m TTL → expiry is in the future relative to call time.
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

    // The persisted hash must not equal the plain token (only the digest is stored).
    const createArg = create.mock.calls[0][0];
    expect(createArg.data.tokenHash).not.toBe(plainToken);
  });

  it('is idempotent for an existing user (upsert update is a no-op)', async () => {
    await service.requestMagicLink('existing@example.com', '203.0.113.9');

    const upsertArg = upsert.mock.calls[0][0];
    expect(upsertArg.update).toEqual({});
    expect(create).toHaveBeenCalledTimes(1);
    expect(sendMagicLink).toHaveBeenCalledTimes(1);
  });
});
