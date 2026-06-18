import './load-test-env'; // side-effect: override DATABASE_URL before AppModule is imported

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BigIntSerializerInterceptor } from '../src/common/bigint-serializer.interceptor';
import { PrismaExceptionFilter } from '../src/common/prisma-exception.filter';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** One outbound email captured by the in-test MailService stub (no real SMTP in e2e). */
export interface CapturedMail {
  kind: 'magic-link' | 'poll-completed';
  to: string;
  /** magic-link only — `${APP_URL}/auth/callback?token=...` */
  link?: string;
  /** poll-completed only — the positional args passed to sendPollCompleted. */
  args?: unknown[];
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Mutable log the MailService stub appends to; assert against it in specs. */
  sentMail: CapturedMail[];
}

/**
 * Boot the whole app against the disposable test schema, re-applying the exact global wiring
 * `main.ts` installs (prefix, cookie parser, BigInt serializer, validation pipe, Prisma exception
 * filter, credentialed CORS) — `createNestApplication()` does NOT replay `bootstrap()`. MailService
 * is stubbed so magic-link / completion mail is captured in-memory instead of hitting SMTP, and the
 * raw magic-link token (never returned by the API) can be recovered from the captured link.
 */
export async function createTestApp(): Promise<TestApp> {
  const sentMail: CapturedMail[] = [];
  const mailStub: Pick<MailService, 'sendMagicLink' | 'sendPollCompleted'> = {
    sendMagicLink: (to: string, link: string) => {
      sentMail.push({ kind: 'magic-link', to, link });
      return Promise.resolve();
    },
    sendPollCompleted: (to: string, ...args: unknown[]) => {
      sentMail.push({ kind: 'poll-completed', to, args });
      return Promise.resolve();
    },
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailStub)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  const config = app.get(ConfigService);
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  app.enableCors({ origin: corsOrigins, credentials: true });

  return { app, prisma: app.get(PrismaService), sentMail };
}

/**
 * Clear every table between flows (child → parent FK order) so each spec starts clean while the one
 * shared disposable schema is reused. DB-level ON DELETE CASCADE would also cover this, but the
 * explicit order keeps the intent obvious and independent of cascade configuration.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.response.deleteMany();
  await prisma.slotTally.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.pollSlot.deleteMany();
  await prisma.pollDate.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.loginToken.deleteMany();
  await prisma.user.deleteMany();
}

/** The authenticated session a successful login yields: cookie jar + the serialized creator. */
export interface AuthSession {
  /** Raw `Set-Cookie` values from the verify response. */
  cookies: string[];
  /** Ready-to-send request header: `name=value; name=value` (attributes stripped). */
  cookieHeader: string;
  user: { id: string; email: string; displayName: string | null };
}

/**
 * Turn a response's `Set-Cookie` values into a request `Cookie` header, keeping only the
 * `name=value` pair of each (dropping `Path`/`HttpOnly`/… attributes so they aren't sent as cookies).
 */
export function toCookieHeader(
  setCookie: string | string[] | undefined,
): string {
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return values.map((c) => c.split(';')[0]).join('; ');
}

/**
 * Drive the full magic-link → verify login over HTTP and return the session cookies plus the
 * authenticated user. The magic-link token is never returned by the API (only its SHA-256 hash is
 * stored), so it is recovered from the captured stub email. Reused by the poll lifecycle spec to
 * obtain an authenticated cookie jar.
 */
export async function loginAs(
  app: INestApplication,
  sentMail: CapturedMail[],
  email: string,
): Promise<AuthSession> {
  const server = app.getHttpServer() as App;
  await request(server)
    .post('/api/auth/magic-link')
    .send({ email })
    .expect(200);

  const mail = [...sentMail]
    .reverse()
    .find((m) => m.kind === 'magic-link' && m.to === email);
  if (!mail?.link) {
    throw new Error(`No magic-link email captured for ${email}`);
  }
  const token = new URL(mail.link).searchParams.get('token');
  if (!token) {
    throw new Error(`Captured magic link had no token: ${mail.link}`);
  }

  const res = await request(server)
    .post('/api/auth/verify')
    .send({ token })
    .expect(200);

  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const body = res.body as { user: AuthSession['user'] };
  return {
    cookies,
    cookieHeader: toCookieHeader(setCookie),
    user: body.user,
  };
}
