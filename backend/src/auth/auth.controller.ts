import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearCookieOptions,
  refreshCookieOptions,
} from './cookie.util';
import { CurrentUser } from './current-user.decorator';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { VerifyDto } from './dto/verify.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Serialized creator returned to authenticated clients (BigInt id → string). */
interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Always returns 200 `{ ok: true }` regardless of whether the email maps to an account
   * (no enumeration). Throttled per IP/window so the endpoint can't be used to spam mail.
   */
  @Post('magic-link')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestMagicLink(
    @Body() dto: RequestMagicLinkDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown';
    await this.authService.requestMagicLink(dto.email, ip);
    return { ok: true };
  }

  /**
   * Exchange a magic-link token for a session: consumes the single-use token, creates a refresh
   * session, and sets httpOnly access + refresh cookies. Throttled to blunt token-guessing.
   */
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(
    @Body() dto: VerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    user: { id: string; email: string; displayName: string | null };
  }> {
    const { user, accessToken, refreshToken } = await this.authService.verify(
      dto.token,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(this.config));
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(this.config));
    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        displayName: user.displayName,
      },
    };
  }

  /**
   * Rotate the refresh token from the refresh cookie and reissue both cookies. A missing cookie
   * is a 401 — the caller has no session to refresh.
   */
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = this.readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { accessToken, refreshToken } = await this.authService.refresh(
      token,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(this.config));
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(this.config));
    return { ok: true };
  }

  /**
   * Revoke the current session and clear both cookies. Idempotent: a missing refresh cookie
   * still returns 200 and clears the cookies.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = this.readRefreshCookie(req);
    await this.authService.logout(token);
    res.clearCookie(ACCESS_COOKIE, clearCookieOptions(this.config));
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions(this.config));
    return { ok: true };
  }

  /**
   * Return the authenticated creator. `JwtAuthGuard` validates the access cookie and attaches the
   * user; this just maps it to the wire shape (id as a string). 401 when the cookie is missing,
   * invalid, or its `tokenVersion` is stale.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): MeResponse {
    return {
      id: user.id.toString(),
      email: user.email,
      displayName: user.displayName,
    };
  }

  /** Read the refresh cookie. `cookie-parser` (wired in main.ts) populates `req.cookies`. */
  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.[REFRESH_COOKIE];
  }
}
