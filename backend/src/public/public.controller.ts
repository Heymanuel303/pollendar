import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { SubmitResponsesDto } from './dto/submit-responses.dto';

/**
 * Anonymous public poll endpoints under `/api/public`. No `@UseGuards` — these are reachable via the
 * public share link without authentication. Phase 2 adds `@Post('polls/:token/responses')` to this
 * same controller. BigInt ids are stringified by the global `BigIntSerializerInterceptor`.
 */
@Controller('public')
export class PublicController {
  constructor(private readonly public_: PublicService) {}

  /** Fetch a poll by its public token; 404 on an unknown/invalid token. */
  @Get('polls/:token')
  getPoll(@Param('token') token: string) {
    return this.public_.findByPublicToken(token);
  }

  /** Live per-slot tallies + the deterministic best slot; 404 on an unknown/invalid token. */
  @Get('polls/:token/results')
  getResults(@Param('token') token: string) {
    return this.public_.getResults(token);
  }

  /** Per-participant displayName + per-slot answers (never email). 404 on unknown token; works for open AND closed polls. Optional ?limit (default 100, cap 1000) & ?offset. */
  @Get('polls/:token/participants-responses')
  getParticipantResponses(
    @Param('token') token: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.public_.getParticipantResponses(
      token,
      limit === undefined ? undefined : Number(limit),
      offset === undefined ? undefined : Number(offset),
    );
  }

  /**
   * Submit availability anonymously; returns the new participant's `{ publicToken }` (201). Tighter
   * per-IP throttle than the global default (mirrors the auth `verify`/`refresh` shape) so the only
   * write endpoint on the public surface can't be flooded; the global `ThrottlerGuard` enforces it.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('polls/:token/responses')
  submit(@Param('token') token: string, @Body() dto: SubmitResponsesDto) {
    return this.public_.submitResponses(token, dto);
  }
}
