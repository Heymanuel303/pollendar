import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes are served under /api (PLAN local dev: http://localhost:3000/api).
  app.setGlobalPrefix('api');

  // Parse Cookie headers so the auth feature (Phase 2+) can read session cookies.
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
