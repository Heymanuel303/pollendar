import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PollOwnershipGuard } from './poll-ownership.guard';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';

// PrismaModule and ConfigModule are global, so PrismaService and ConfigService inject without
// being imported. JwtModule is registered here (mirroring AuthModule) so JwtAuthGuard's JwtService
// dependency resolves, AuthModule does not export the guard.
@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'ACCESS_TOKEN_TTL',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [PollsController],
  providers: [PollsService, JwtAuthGuard, PollOwnershipGuard],
})
export class PollsModule {}
