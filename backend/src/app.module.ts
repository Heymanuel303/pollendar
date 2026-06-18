import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validate } from './config/env.validation';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PollsModule } from './polls/polls.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Single source of truth: the repo-root .env (resolved relative to the
      // backend cwd used by `npm run start:dev` / jest). No secrets under backend/.
      envFilePath: ['../.env'],
      validate,
    }),
    // THROTTLE_TTL is seconds; @nestjs/throttler expects milliseconds.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL')! * 1000,
          limit: config.get<number>('THROTTLE_LIMIT')!,
        },
      ],
    }),
    PrismaModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    PollsModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global throttler so @Throttle decorators take effect across controllers.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
