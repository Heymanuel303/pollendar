import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// PrismaModule and ConfigModule are global, so PrismaService and ConfigService
// inject without being imported here.
@Module({
  imports: [
    MailModule,
    // Access JWTs are signed with JWT_ACCESS_SECRET; the service also passes these
    // explicitly per-sign, but registering them keeps the module self-describing and
    // ready for Phase 4's verifying guard.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          // jsonwebtoken types expiresIn as ms.StringValue, not a bare string.
          expiresIn: config.getOrThrow<string>(
            'ACCESS_TOKEN_TTL',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // JwtAuthGuard is local to this phase; export it once another module (e.g. PollsModule) needs it.
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
