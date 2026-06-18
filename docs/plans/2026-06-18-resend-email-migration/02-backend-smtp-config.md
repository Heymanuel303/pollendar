# Phase 2: Backend SMTP config — Resend in prod, Mailpit in dev

**Plan:** [resend-email-migration](00-overview.md)
**Depends on:** [01-resend-domain-verification.md](01-resend-domain-verification.md)
**Execution:** solo

## Context
Pollendar's outbound mail (magic-link + poll-completed) goes through the existing nodemailer-based `MailService`, which is entirely env-driven. The migration's goal is to send production mail via Resend SMTP from `Pollendar <pollendar@heymanuel.ch>` while keeping Mailpit for local dev and the e2e suite — production vs dev is purely a matter of which env values are supplied. This phase hardens env handling and docs/examples so a prod deploy points at `smtp.resend.com` with auth + TLS, without touching `MailService`'s logic or public API.

## Objective
Make the backend send via Resend SMTP in production through the existing `MailService` by hardening `env.validation` (require SMTP auth + secure outside dev), documenting a Resend production block in `.env.example`, and extending `mail.service.spec` to cover the authenticated/secure (port 465) transport — with dev still on Mailpit and all unit tests green.

## Files to touch
- `backend/src/config/env.validation.ts` — add conditional validation: when `NODE_ENV !== development`, require `SMTP_USER` + `SMTP_PASSWORD` non-empty and `SMTP_SECURE === true`. Keep them optional/auth-less for dev. Do NOT add `RESEND_API_KEY` (the Resend API key is supplied via `SMTP_PASSWORD`).
- `backend/src/config/env.validation.spec.ts` — add cases proving (a) dev still accepts empty SMTP creds + `SMTP_SECURE=false`, (b) prod rejects missing/empty `SMTP_USER`/`SMTP_PASSWORD`, (c) prod rejects `SMTP_SECURE=false`, (d) prod accepts the full Resend block.
- `backend/src/mail/mail.service.spec.ts` — add a Resend-style suite: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, `SMTP_PASSWORD=<key>`, asserting `createTransport` is called with `secure: true` and `auth: { user: 'resend', pass: ... }`. Keep the existing Mailpit (auth-less) cases unchanged.
- `.env.example` — keep the dev Mailpit block as the active default; append a commented-out "Production (Resend SMTP)" block documenting the exact prod values and that `SMTP_PASSWORD` is the Resend API key. Set the documented prod `MAIL_FROM` to `Pollendar <pollendar@heymanuel.ch>`.

> **Scope boundary:** this phase owns `.env.example`. `docs/DEPLOY.md`, `docker-compose.yml`, and the READMEs are owned by Phase 3 — do **not** edit them here.

## Steps
1. **`backend/src/config/env.validation.ts` — conditional SMTP hardening.** Mirror the existing `validate()`/`validateSync` pattern. After `validateSync` succeeds (so coercion has run and `validatedConfig.NODE_ENV`, `.SMTP_SECURE` are typed), add an explicit guard before the `return`:
   - if `validatedConfig.NODE_ENV !== Environment.Development`:
     - require `validatedConfig.SMTP_USER?.trim()` truthy, else push an error like `SMTP_USER: required outside development (Resend SMTP needs auth)`;
     - require `validatedConfig.SMTP_PASSWORD?.trim()` truthy, else `SMTP_PASSWORD: required outside development (Resend SMTP API key)`;
     - require `validatedConfig.SMTP_SECURE === true`, else `SMTP_SECURE: must be true outside development (Resend SMTP uses TLS on port 465)`.
   - Collect these into the same thrown `Error('Invalid environment configuration:\n...')` shape the function already produces (reuse the existing format, or throw a second formatted `Error` with the same prefix). Do NOT change the class-level `@IsOptional()` on `SMTP_USER`/`SMTP_PASSWORD` (dev still needs them absent) and do NOT add new env vars. Leave `Test` (`NODE_ENV=test`) behaving like prod for these checks is acceptable — but the backend e2e stub does not boot a real transport, so confirm in step 7 that e2e setup isn't affected; if it is, scope the guard to `Environment.Production` only.
2. **`backend/src/config/env.validation.spec.ts` — dev still green.** Keep `completeEnv()` (dev, empty SMTP creds, `SMTP_SECURE=false`) and its existing assertions untouched; they already prove dev accepts auth-less Mailpit.
3. **`backend/src/config/env.validation.spec.ts` — add a `prodEnv()` helper** that spreads `completeEnv()` with `NODE_ENV: 'production'`, `COOKIE_SECURE: 'true'`, `SMTP_HOST: 'smtp.resend.com'`, `SMTP_PORT: '465'`, `SMTP_SECURE: 'true'`, `SMTP_USER: 'resend'`, `SMTP_PASSWORD: 're_test_key'`, `MAIL_FROM: 'Pollendar <pollendar@heymanuel.ch>'`.
4. **`backend/src/config/env.validation.spec.ts` — add prod assertions:**
   - `validate(prodEnv())` does NOT throw;
   - `validate({ ...prodEnv(), SMTP_USER: '' })` throws `/SMTP_USER/`;
   - `validate({ ...prodEnv(), SMTP_PASSWORD: '' })` throws `/SMTP_PASSWORD/`;
   - `validate({ ...prodEnv(), SMTP_SECURE: 'false' })` throws `/SMTP_SECURE/`;
   - (sanity) `validate(prodEnv())` returns `config.SMTP_SECURE === true` and `config.SMTP_USER === 'resend'`.
5. **`backend/src/mail/mail.service.spec.ts` — Resend transport suite.** Add a `describe('with Resend SMTP credentials', ...)` block using the existing `buildConfig`/`compile` helpers. Build config with overrides `{ SMTP_SECURE: true, SMTP_USER: 'resend', SMTP_PASSWORD: 're_test_key' }` and `required` overrides for `SMTP_HOST: 'smtp.resend.com'`, `SMTP_PORT: '465'`, `MAIL_FROM: 'Pollendar <pollendar@heymanuel.ch>'`. Because `buildConfig` only spreads `overrides` into `optional`, extend it (or add a parallel local builder in the new `describe`) so the `required` map can also be overridden — keep the existing default `buildConfig()` behavior identical for the Mailpit cases. Assert `nodemailer.createTransport` was called with `{ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: 're_test_key' } }`. Do NOT remove or alter the existing "without auth" or "with SMTP credentials" cases.
6. **`backend/src/mail/mail.service.spec.ts` — From-address assertion (optional but cheap).** In the Resend suite, also `await service.sendMagicLink('x@y.z', 'http://link')` and assert `sendMail` was called with `from: 'Pollendar <pollendar@heymanuel.ch>'`, proving the verified-domain From flows through unchanged.
7. **Confirm `MailService` and the backend e2e stub are untouched.** Do NOT edit `backend/src/mail/mail.service.ts`, `backend/src/mail/mail.module.ts`, `backend/src/auth/auth.service.ts`, `backend/src/notifications/notifications.service.ts`, or `backend/test/setup-e2e.ts`. The stub replaces `sendMagicLink`/`sendPollCompleted` with an in-memory capture and never constructs a real transport, so the new env guard must not break it — if the e2e suite boots with `NODE_ENV=test` and real (Mailpit) SMTP env, either keep `SMTP_SECURE=true`+creds in the e2e env or (preferred) scope the guard in step 1 to `Environment.Production` only. Decide based on the e2e env actually used; default to **production-only** scoping to avoid disturbing dev/test/e2e.
8. **`.env.example` — keep dev active, document prod.** Leave the existing `# Email — dev points at Mailpit` block (lines for `SMTP_HOST=localhost` … `MAIL_FROM="Pollendar <no-reply@pollendar.local>"`) as-is. Directly beneath it, append a clearly-commented production block, every line prefixed with `#` so it stays inert for dev:
   ```
   # ── Production (Resend SMTP) ── uncomment + move to your prod secret manager.
   # Resend SMTP: host is fixed, SMTP_USER is the LITERAL string "resend",
   # SMTP_PASSWORD is your Resend API key (re_...). MAIL_FROM must be on the
   # Resend-verified domain (heymanuel.ch). Port 465 = TLS (SMTP_SECURE=true);
   # alternatively port 587 with SMTP_SECURE=false (STARTTLS).
   # SMTP_HOST=smtp.resend.com
   # SMTP_PORT=465
   # SMTP_SECURE=true
   # SMTP_USER=resend
   # SMTP_PASSWORD=re_your_resend_api_key
   # MAIL_FROM="Pollendar <pollendar@heymanuel.ch>"
   ```
   Do NOT add a `RESEND_API_KEY` line (it is not consumed by the backend; the key lives in `SMTP_PASSWORD`). If a stray `RESEND_API_KEY=...` line exists in the real `.env`, leave `.env` alone — it is git-ignored and out of scope.

## Verification
- `npm run format` (in `backend/`) — prettier clean.
- `npm run lint` (in `backend/`) — eslint --fix passes with no errors.
- `npm test` (in `backend/`) — full Jest unit suite green; specifically `mail.service.spec.ts` and `env.validation.spec.ts`:
  - `npm test -- mail.service.spec` (in `backend/`) — Mailpit auth-less, "with SMTP credentials", and new Resend (port 465, secure, auth) cases all pass.
  - `npm test -- env.validation.spec` (in `backend/`) — dev (empty creds, secure=false) passes; prod missing/empty `SMTP_USER`/`SMTP_PASSWORD` and `SMTP_SECURE=false` are rejected; full Resend prod env accepted.
- `npm run build` (in `backend/`) — compiles (no type regressions from the env guard).
- Manual: `grep -n "smtp.resend.com" .env.example` shows the documented (commented) prod block; `grep -n "RESEND_API_KEY" backend/src` returns nothing (key is never read as its own var).
- Manual sanity (no real send): with prod-style env, the app boot would fail fast if SMTP auth/secure are missing — covered by the env.validation prod tests rather than a live boot.

## Acceptance
- [ ] `env.validation` requires non-empty `SMTP_USER` + `SMTP_PASSWORD` and `SMTP_SECURE=true` in production, and still accepts auth-less `SMTP_SECURE=false` in development (proven by `env.validation.spec.ts`).
- [ ] `mail.service.spec.ts` has a Resend suite asserting `createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: ... } })`, and the existing Mailpit cases still pass.
- [ ] `.env.example` keeps the active dev Mailpit block and adds a commented-out Resend production block with `MAIL_FROM="Pollendar <pollendar@heymanuel.ch>"`; no `RESEND_API_KEY` var is introduced.
- [ ] `MailService` source/public API, `mail.module.ts`, `auth.service.ts`, `notifications.service.ts`, and `backend/test/setup-e2e.ts` are unchanged.
- [ ] `docs/DEPLOY.md`, `docker-compose.yml`, and the READMEs are untouched (owned by Phase 3).
- [ ] `npm run lint`, `npm test`, and `npm run build` (in `backend/`) all pass; changes left uncommitted (no push, no PR).
