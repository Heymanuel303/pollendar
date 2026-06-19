import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { BigIntSerializerInterceptor } from './common/bigint-serializer.interceptor';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes are served under /api (PLAN local dev: http://localhost:3000/api).
  app.setGlobalPrefix('api');

  // Parse Cookie headers so the auth feature (Phase 2+) can read session cookies.
  app.use(cookieParser());

  // Serialize Prisma BigInt ids → strings on every response (JSON.stringify(BigInt) throws).
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());

  // Validate + strip request bodies. `transform: true` is required so nested DTOs (@Type) are
  // instantiated as classes and their @ValidateNested rules run.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Safety-net for unhandled Prisma errors: maps known codes to clean HTTP statuses without leaking
  // DB internals. The inline service mappings (HttpException subclasses) are unaffected, this filter
  // only catches `Prisma.PrismaClientKnownRequestError`.
  app.useGlobalFilters(new PrismaExceptionFilter());

  const configService = app.get(ConfigService);

  // Allow the credentialed SPA to call the API cross-origin. `credentials: true` plus an explicit
  // origin list (never `*`) is required so the browser keeps the httpOnly auth cookie set by
  // /auth/verify and sends it back on every `credentials: "include"` request. CORS_ORIGINS is a
  // comma-separated allow-list (e.g. `http://localhost:5173`); whitespace around entries is trimmed.
  const corsOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  app.enableCors({ origin: corsOrigins, credentials: true });

  const port = configService.get<number>('API_PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
