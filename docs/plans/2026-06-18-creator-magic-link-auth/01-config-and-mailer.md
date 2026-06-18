# Phase 1: config-and-mailer

**Plan:** [creator-magic-link-auth](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Pollendar needs passwordless creator auth: a creator enters their email, receives a magic link, and clicks it to sign in. Sending that link requires a working mail transport. This phase builds the foundation — a global `MailModule`/`MailService` that talks to the dev Mailpit SMTP server via nodemailer, fully driven by the already-validated `SMTP_*` / `MAIL_FROM` env vars. Phase 2 (the AuthModule) will consume `MailService.sendMagicLink(...)`; nothing here touches the DB, schema, or HTTP layer beyond wiring `cookie-parser` into `main.ts` so Phase 2 can read cookies.

## Objective
Deliver a global, dependency-injected `MailService` exposing `sendMagicLink(email, link): Promise<void>`, wired into `AppModule`, plus `cookie-parser` middleware registered in `main.ts`.

## Files to touch
- `backend/src/mail/mail.service.ts` — NEW: `@Injectable()` `MailService`; builds a nodemailer transporter from `ConfigService` and implements `sendMagicLink`.
- `backend/src/mail/mail.module.ts` — NEW: `@Global()` `@Module` providing + exporting `MailService`.
- `backend/src/mail/mail.service.spec.ts` — NEW: Jest spec mocking `nodemailer` + `ConfigService`, asserting transport config and `sendMagicLink` behavior.
- `backend/src/app.module.ts` — EDIT: add `MailModule` to the `imports` array.
- `backend/src/main.ts` — EDIT: register `app.use(cookieParser())` after `setGlobalPrefix('api')`, before `listen`.

## Steps
1. Create `backend/src/mail/mail.service.ts`:
   - Imports: `import { Injectable, Logger } from '@nestjs/common';`, `import { ConfigService } from '@nestjs/config';`, `import * as nodemailer from 'nodemailer';` (and `import type { Transporter } from 'nodemailer';`).
   - Class `MailService` with `private readonly logger = new Logger(MailService.name);` and `private readonly transporter: Transporter;` and a `private readonly from: string;`.
   - Constructor `constructor(private readonly config: ConfigService)`:
     - Read required vars with `getOrThrow`: `const host = this.config.getOrThrow<string>('SMTP_HOST');`, `const port = Number(this.config.getOrThrow<string>('SMTP_PORT'));`, `this.from = this.config.getOrThrow<string>('MAIL_FROM');`.
     - Read `const secure = this.config.get<boolean>('SMTP_SECURE') ?? false;` (env.validation coerces it to boolean; `?? false` is a safety net).
     - Read optional creds with `get`: `const user = this.config.get<string>('SMTP_USER');` and `const pass = this.config.get<string>('SMTP_PASSWORD');`.
     - Build auth conditionally — Mailpit needs none: `const auth = user ? { user, pass } : undefined;`.
     - `this.transporter = nodemailer.createTransport({ host, port, secure, auth });`.
   - Implement `async sendMagicLink(email: string, link: string): Promise<void>`:
     - `const subject = 'Your Pollendar sign-in link';`
     - Build `text` (plain fallback) e.g. `` `Sign in to Pollendar by opening this link:\n\n${link}\n\nThis link expires shortly and can be used once. If you didn't request it, ignore this email.` `` and an `html` version wrapping `link` in an `<a href="${link}">Sign in to Pollendar</a>` plus the expiry/ignore note.
     - `try { await this.transporter.sendMail({ from: this.from, to: email, subject, text, html }); this.logger.log(\`Magic link sent to ${email}\`); } catch (err) { this.logger.error(\`Failed to send magic link to ${email}\`, err instanceof Error ? err.stack : String(err)); throw err; }` — log and re-throw (Phase 2 decides how to handle; no retry logic in Phase 1).
   - Do NOT generate or hash tokens here — `MailService` only transports a pre-built `link`. Token generation/hashing (`crypto.randomBytes(32).toString('base64url')`, `crypto.createHash('sha256').update(token).digest('hex')`) belongs to Phase 2's AuthService.
2. Create `backend/src/mail/mail.module.ts`:
   - `import { Global, Module } from '@nestjs/common';`, `import { MailService } from './mail.service';`.
   - `@Global() @Module({ providers: [MailService], exports: [MailService] }) export class MailModule {}`.
3. Edit `backend/src/app.module.ts`:
   - Add `import { MailModule } from './mail/mail.module';` near the other module imports.
   - Add `MailModule` to the `imports` array (place it after `PrismaModule`). Order is irrelevant since `ConfigModule` is global and `MailModule` is global.
4. Edit `backend/src/main.ts`:
   - Add `import * as cookieParser from 'cookie-parser';` (top of file). If TS complains about default-vs-namespace import under the repo's `esModuleInterop` setting, use `import cookieParser from 'cookie-parser';` — match whichever the existing imports style/`tsconfig` accepts (the `@types/cookie-parser` are installed).
   - After `app.setGlobalPrefix('api');` and before `await app.listen(port);`, add `app.use(cookieParser());`. (No secret needed — cookies in this feature are signed only as JWTs, not via cookie-parser's secret arg.)
5. Create `backend/src/mail/mail.service.spec.ts`:
   - At the very top, before importing `MailService`: `jest.mock('nodemailer');` then `import * as nodemailer from 'nodemailer';`.
   - In a `describe('MailService', ...)`, declare `let service: MailService;` and `const sendMail = jest.fn();`.
   - `beforeEach`:
     - `(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });` and `sendMail.mockReset();`.
     - Build a mock `ConfigService` whose `getOrThrow` returns test values (`SMTP_HOST` → `'localhost'`, `SMTP_PORT` → `'1025'`, `MAIL_FROM` → `'Pollendar <no-reply@pollendar.local>'`) and whose `get` returns `undefined` for `SMTP_USER`/`SMTP_PASSWORD` and `false` for `SMTP_SECURE`.
     - `const moduleRef = await Test.createTestingModule({ providers: [MailService, { provide: ConfigService, useValue: mockConfig }] }).compile();` then `service = moduleRef.get(MailService);`.
   - Tests (`it`):
     - `'creates a transporter without auth when no SMTP credentials'` → assert `nodemailer.createTransport` called with `{ host: 'localhost', port: 1025, secure: false, auth: undefined }`.
     - `'sendMagicLink sends an email to the address with the link in the body'` → `await service.sendMagicLink('creator@example.com', 'http://localhost:5173/auth/callback?token=abc')`; assert `sendMail` called once with an object whose `to` is the email, `from` is the MAIL_FROM, and whose `html`/`text` contain the link.
     - `'sendMagicLink re-throws when the transport fails'` → `sendMail.mockRejectedValueOnce(new Error('smtp down'))`; `await expect(service.sendMagicLink('x@y.z', 'http://link')).rejects.toThrow('smtp down')`.
     - (Optional) a second `describe` block that re-instantiates with `SMTP_USER`/`SMTP_PASSWORD` set and asserts `auth: { user, pass }` is passed.

## Verification
- Lint: `cd backend && npm run lint`
- Format: `cd backend && npm run format`
- Scoped tests: `cd backend && npm test -- mail` (runs `mail.service.spec.ts`; all green, transporter built without auth, link present in body, failures re-thrown).
- Full suite still green: `cd backend && npm test`
- Manual end-to-end against Mailpit (no Phase-2 endpoint yet, so exercise the service directly):
  - Start infra: `docker compose up -d` (MySQL :3306, Mailpit SMTP :1025, UI http://localhost:8025).
  - From `backend/`, run a one-off script that boots the Nest app context and calls the service:
    ```bash
    cd backend && npx ts-node -e "import('./src/app.module').then(async ({ AppModule }) => { const { NestFactory } = await import('@nestjs/core'); const { MailService } = await import('./src/mail/mail.service'); const app = await NestFactory.createApplicationContext(AppModule); await app.get(MailService).sendMagicLink('creator@example.com', 'http://localhost:5173/auth/callback?token=demo123'); await app.close(); })"
    ```
  - Open http://localhost:8025 and confirm an email arrived: To `creator@example.com`, From the `MAIL_FROM` address, subject "Your Pollendar sign-in link", body containing the clickable `http://localhost:5173/auth/callback?token=demo123` link.

## Acceptance
- [x] `backend/src/mail/mail.service.ts` exports a `@Injectable()` `MailService` with `sendMagicLink(email: string, link: string): Promise<void>`.
- [x] `backend/src/mail/mail.module.ts` is `@Global()` and exports `MailService`; `AppModule.imports` includes `MailModule` and the app boots (`npm run start:dev` starts cleanly on http://localhost:3000/api).
- [x] Transporter is built from `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` and omits `auth` when `SMTP_USER` is empty (Mailpit dev path).
- [x] `app.use(cookieParser())` is registered in `main.ts` after `setGlobalPrefix('api')` and before `listen`.
- [x] `npm test -- mail` passes; `npm run lint` reports no errors.
- [ ] Calling `sendMagicLink` (via the one-off script above) produces a visible email in the Mailpit UI at http://localhost:8025 whose body contains the magic link URL.
