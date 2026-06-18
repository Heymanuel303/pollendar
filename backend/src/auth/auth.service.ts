import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

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
  ) {}

  /** 32 random bytes as a 43-char base64url string — the plain token mailed to the user. */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /** SHA-256 hex digest (64 chars) — the only token representation persisted. */
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
   * magic link. Always resolves for valid input (upsert guarantees a row) — only infra
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
}
