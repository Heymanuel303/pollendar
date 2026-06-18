import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
