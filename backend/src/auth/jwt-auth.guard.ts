import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE } from './cookie.util';

/** Decoded claims of the access JWT signed in `AuthService.issueAccessToken`. */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  tokenVersion: number;
}

/** Request enriched with the authenticated creator once the guard has run. */
export type AuthenticatedRequest = Request & { user: User };

/**
 * Validates the httpOnly access cookie: verifies the JWT against `JWT_ACCESS_SECRET`, loads the
 * user, and rejects unless the token's `tokenVersion` still matches `users.token_version` (a bump
 * invalidates every outstanding access token). On success the user is attached as `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const token = cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: JwtAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }

    (req as AuthenticatedRequest).user = user;
    return true;
  }
}
