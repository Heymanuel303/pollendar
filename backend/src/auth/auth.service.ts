import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/** Request metadata recorded on a session for audit/debugging. */
interface SessionContext {
  ip?: string;
  userAgent?: string;
}

/** The minimal user shape needed to mint an access token. */
interface AccessTokenUser {
  id: bigint;
  email: string;
  tokenVersion: number;
}

const TTL_MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Passwordless creator auth. `requestMagicLink` upserts the user, persists only the
 * SHA-256 hash of a single-use token, and emails the plain token as a magic link.
 * Raw tokens are never written to the database.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** 32 random bytes as a 43-char base64url string, the plain token mailed to the user. */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /** SHA-256 hex digest (64 chars), the only token representation persisted. */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Parse a TTL string like '15m' / '30d' / '45s' / '1h' to milliseconds. */
  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl}`);
    }
    return Number(match[1]) * TTL_MULTIPLIERS[match[2]];
  }

  /**
   * Upsert the user by email and create a hashed single-use login token, then email the
   * magic link. Always resolves for valid input (upsert guarantees a row), only infra
   * failures (DB/SMTP) propagate, so the caller can return a fixed 200 with no enumeration.
   */
  async requestMagicLink(email: string, requestIp: string): Promise<void> {
    const plainToken = this.generateToken();
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date(
      Date.now() +
        this.parseTtlToMs(this.config.get<string>('MAGIC_LINK_TTL')!),
    );

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, displayName: email.split('@')[0] },
      });
      await tx.loginToken.create({
        data: { userId: user.id, tokenHash, expiresAt, requestIp },
      });
    });

    const link = `${this.config.get<string>('APP_URL')}/auth/callback?token=${plainToken}`;
    await this.mail.sendMagicLink(email, link);
  }

  /**
   * Exchange a raw magic-link token for a logged-in session. Consumes the single-use login
   * token and creates the refresh session atomically (one transaction) so the same token can
   * never mint two sessions. Returns the raw refresh + access token for the controller to set
   * as httpOnly cookies; only their SHA-256 hashes ever touch the database.
   */
  async verify(
    rawToken: string,
    ctx: SessionContext,
  ): Promise<{
    user: AccessTokenUser & { displayName: string | null };
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = this.hashToken(rawToken);
    const loginToken = await this.prisma.loginToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !loginToken ||
      loginToken.consumedAt !== null ||
      loginToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired link');
    }

    const { rawRefresh, op } = this.createSession(loginToken.userId, ctx);
    await this.prisma.$transaction([
      this.prisma.loginToken.update({
        where: { id: loginToken.id },
        data: { consumedAt: new Date() },
      }),
      op,
    ]);

    const accessToken = await this.issueAccessToken(loginToken.user);
    return { user: loginToken.user, accessToken, refreshToken: rawRefresh };
  }

  /**
   * Rotate a refresh session: revoke the presented one and issue a fresh refresh token + access
   * token in a single transaction. A missing/revoked/expired refresh token is rejected.
   */
  async refresh(
    rawRefresh: string,
    ctx: SessionContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshTokenHash = this.hashToken(rawRefresh);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session expired');
    }

    const { rawRefresh: newRawRefresh, op } = this.createSession(
      session.userId,
      ctx,
    );
    await this.prisma.$transaction([
      this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      op,
    ]);

    const accessToken = await this.issueAccessToken(session.user);
    return { accessToken, refreshToken: newRawRefresh };
  }

  /**
   * Revoke the session backing a refresh token. Idempotent: resolves without throwing when the
   * token is absent or already revoked, so logout is always safe to call.
   */
  async logout(rawRefresh?: string): Promise<void> {
    if (!rawRefresh) {
      return;
    }
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: this.hashToken(rawRefresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Prepare a new refresh session. Returns the raw token (mailed/cookied, never stored) and a
   * lazy Prisma create op so the caller can compose it into a single atomic transaction with
   * the consume/revoke of the prior token. Only the SHA-256 hash is written to the DB.
   */
  private createSession(userId: bigint, ctx: SessionContext) {
    const rawRefresh = this.generateToken();
    const refreshTokenHash = this.hashToken(rawRefresh);
    const expiresAt = new Date(
      Date.now() +
        this.parseTtlToMs(this.config.get<string>('REFRESH_TOKEN_TTL')!),
    );
    const op = this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
        ip: ctx.ip ?? null,
      },
    });
    return { rawRefresh, op };
  }

  /** Sign a short-lived access JWT. `sub` is the BigInt id serialized as a string. */
  private issueAccessToken(user: AccessTokenUser): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id.toString(),
        email: user.email,
        tokenVersion: user.tokenVersion,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // jsonwebtoken types expiresIn as ms.StringValue, not a bare string.
        expiresIn: this.config.getOrThrow<string>(
          'ACCESS_TOKEN_TTL',
        ) as JwtSignOptions['expiresIn'],
      },
    );
  }
}
