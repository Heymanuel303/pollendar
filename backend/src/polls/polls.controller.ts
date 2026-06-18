import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollsService } from './polls.service';
import { buildShareUrl } from './public-token.util';

/**
 * Creator poll endpoints, all under `/api/polls` and guarded by `JwtAuthGuard`. `BigInt` ids in
 * responses are stringified by the global `BigIntSerializerInterceptor`.
 */
@Controller('polls')
@UseGuards(JwtAuthGuard)
export class PollsController {
  constructor(
    private readonly polls: PollsService,
    private readonly config: ConfigService,
  ) {}

  /** Create a poll with nested dates + slots; returns a thin shape with the shareable URL. */
  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreatePollDto) {
    const poll = await this.polls.create(user.id, dto);
    return {
      id: poll.id,
      publicToken: poll.publicToken,
      shareUrl: buildShareUrl(
        this.config.getOrThrow<string>('APP_URL'),
        poll.publicToken,
      ),
      title: poll.title,
      status: poll.status,
    };
  }

  /** List only the caller's own polls, newest first. */
  @Get()
  list(@CurrentUser() user: User) {
    return this.polls.findAllForUser(user.id);
  }

  /** View one owned poll with nested dates/slots; 404 if not owned or missing. */
  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.polls.findOneForUser(user.id, this.parseId(id));
  }

  /** Parse a path id to BigInt; a non-numeric id is a 404 (same as not-found, no leak). */
  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new NotFoundException();
    }
  }
}
