import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * Anonymous public poll access. No `JwtModule` and no guards (unlike `PollsModule`) — these routes
 * are reachable via the public share link without authentication. `PrismaService` resolves via the
 * global `PrismaModule`.
 */
@Module({
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
