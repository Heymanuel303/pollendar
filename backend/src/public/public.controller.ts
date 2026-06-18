import { Controller, Get, Param } from '@nestjs/common';
import { PublicService } from './public.service';

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
}
