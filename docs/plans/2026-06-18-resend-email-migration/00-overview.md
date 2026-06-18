# Resend email migration

**Slug:** `resend-email-migration` (folder: `docs/plans/2026-06-18-resend-email-migration/`)
**Created:** 2026-06-18
**Status:** in-progress

## Goal
Migrate Pollendar's **production** outbound email (magic-link sign-in + poll-completed notices) from the local docker-compose **Mailpit** SMTP sink to **Resend**, sending from `Pollendar <pollendar@heymanuel.ch>` (the owner controls `heymanuel.ch`). Local dev and the e2e suites keep using Mailpit — the prod-vs-dev switch is purely env-driven, with **no change to `MailService` logic or its public API**.

## Decisions (locked)
- **Resend SMTP via the existing nodemailer `MailService`** — no `resend` SDK, no MailService rewrite. Prod env points at `smtp.resend.com` (`SMTP_USER` = literal `resend`, `SMTP_PASSWORD` = Resend API key, `SMTP_SECURE=true` on port 465 / `false` on 587 STARTTLS).
- **Keep Mailpit for local dev + e2e.** docker-compose, the backend e2e MailService stub (`backend/test/setup-e2e.ts`), and the frontend Playwright Mailpit helper (`frontend/e2e/helpers/mailpit.ts`) are unaffected.

## Scope
- `backend/src/config/env.validation.ts` (+ `.spec`): require SMTP auth + `SMTP_SECURE=true` outside development (production-scoped).
- `backend/src/mail/mail.service.spec.ts`: add a Resend (port 465, secure, auth) transport case.
- `.env.example`: commented Resend production block alongside the active dev Mailpit block.
- `docs/DEPLOY.md`, `README.md`, `backend/README.md`, `frontend/README.md`, `docker-compose.yml` header: document the prod=Resend / dev=Mailpit split + one-time Resend domain setup + real-send verification.
- DNS for `heymanuel.ch`: SPF / DKIM / DMARC / return-path records (external, in the DNS provider + Resend dashboard).

## Out of scope
- Adding the `resend` npm SDK or rewriting `MailService`.
- Removing Mailpit, or changing dev/e2e email flow or the mail-reading harness.
- Changing email content/templates beyond the From address.
- Changing the `MailService` public API (`sendMagicLink` / `sendPollCompleted`) or its consumers (`auth.service.ts`, `notifications.service.ts`).

## Constraints
- `MAIL_FROM` must be on the Resend-verified domain (`heymanuel.ch`), else Resend rejects/spam-folders.
- DNS propagation gates the live send: Phase 1's domain verification must read **Verified** before the Phase 3 real-send check (the code/config in Phase 2 can be written + unit-tested without DNS).
- The new env guard must be **production-scoped** so dev/test/e2e (Mailpit, auth-less, `SMTP_SECURE=false`) keep booting.
- No secret values in the repo — the Resend API key lives only in the production secret manager; `.env.example`/docs use `re_...` placeholders.

## Acceptance criteria
- [ ] `heymanuel.ch` is **Verified** in Resend (DKIM + SPF/return-path + DMARC live); a sending-scoped API key exists in the secret manager (not the repo).
- [ ] `env.validation` requires non-empty `SMTP_USER`/`SMTP_PASSWORD` + `SMTP_SECURE=true` in production, and still accepts auth-less `SMTP_SECURE=false` in dev (proven by specs).
- [ ] `mail.service.spec.ts` covers the Resend transport (`createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass } })`); Mailpit cases still pass.
- [ ] `.env.example` + `docs/DEPLOY.md` + READMEs + `docker-compose.yml` header document the env-driven prod=Resend / dev+e2e=Mailpit split; no secrets committed.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` (backend) and the Playwright happy path (frontend, vs Mailpit) all pass unchanged.
- [ ] A real magic-link email from `pollendar@heymanuel.ch` arrives in a real inbox and shows **Delivered** in the Resend dashboard.

## Phases
1. [01-resend-domain-verification](01-resend-domain-verification.md) — Resend account + `heymanuel.ch` DNS verification (SPF/DKIM/DMARC) + sending API key, captured as a runbook · _solo_
2. [02-backend-smtp-config](02-backend-smtp-config.md) — production-scoped env validation + `.env.example` Resend block + Resend transport spec (no MailService change) · _solo_ ✓
3. [03-deploy-wiring-and-docs](03-deploy-wiring-and-docs.md) — DEPLOY.md/README/compose docs for the split + secret-manager wiring + real end-to-end send verification · _solo_

## Notes & open questions
- **File ownership (deduped):** Phase 2 owns `.env.example`; Phase 3 owns `docs/DEPLOY.md`, `docker-compose.yml`, and the READMEs. Phase 3 only *verifies* `.env.example`.
- **Runbook duplication is intentional:** Phase 1's `RESEND-RUNBOOK.md` is the as-built record (actual records/values used). Phase 3's `docs/DEPLOY.md` "Resend setup (one-time)" is the canonical living operator runbook. Keep DEPLOY.md authoritative; the plan-folder runbook is a planning artifact.
- **Port choice:** plan assumes 465 + `SMTP_SECURE=true`. If the prod host blocks 465, switch to 587 + `SMTP_SECURE=false` (STARTTLS) — adjust the Phase 2 guard's `SMTP_SECURE===true` requirement accordingly.
- **Subdomain option (not chosen):** sending from a subdomain like `send.heymanuel.ch` would isolate the apex domain's reputation, but the requested sender is the apex `pollendar@heymanuel.ch`, so the plan verifies the apex domain.
