import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
          expiresIn: config.getOrThrow<string>('ACCESS_TOKEN_TTL'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
