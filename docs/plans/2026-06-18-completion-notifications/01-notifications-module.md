# Phase 1: NotificationsModule + completion-email service

**Plan:** [completion-notifications](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Closing the poll loop means that when a creator picks the final slot, the participants who left an email should each receive a completion email exactly once, and re-completing must never double-send. This phase builds the delivery engine: a `NotificationsModule`/`NotificationsService` that selects emailable participants, renders & sends the completion email through the existing `MailService`, and records idempotent `email_log` rows (queued → sent/failed) keyed by `@@unique([pollId, participantId, type])`. Later phases wire this service into the `PollsController` complete/invite-message endpoints; this phase delivers only the reusable notifications engine plus the completion-email method on `MailService`.

## Objective
Add `NotificationsModule` + `NotificationsService.sendPollCompletedEmails(...)` that emails only participants with a non-null email, recording a single idempotent `email_log` row per participant via the unique constraint, plus a `MailService.sendPollCompleted(...)` method to render/transport the email.

## Files to touch
- `backend/src/notifications/notifications.module.ts` — new `@Module` providing/exporting `NotificationsService` (relies on global `PrismaService` and global `MailModule`/`MailService`; no imports needed).
- `backend/src/notifications/notifications.service.ts` — new `@Injectable() NotificationsService` with the email-fan-out + idempotent `email_log` logic.
- `backend/src/notifications/notifications.service.spec.ts` — colocated Jest spec covering the four acceptance signals with fully-typed `jest.fn` mocks for `PrismaService` and `MailService`.
- `backend/src/mail/mail.service.ts` — add `sendPollCompleted(email, pollTitle, finalSlotLabel, shareUrl): Promise<void>` mirroring `sendMagicLink` (subject/text/html, `this.from`, try/catch + logger, re-throw on failure).
- `backend/src/mail/mail.service.spec.ts` — add a case asserting `sendPollCompleted` calls the transporter with the expected `from`/`to`/`subject` and embeds the share URL.
- `backend/src/app.module.ts` — register `NotificationsModule` in the `imports` array.

## Steps
1. In `backend/src/mail/mail.service.ts`, add `async sendPollCompleted(email: string, pollTitle: string, finalSlotLabel: string, shareUrl: string): Promise<void>`. Build `subject = `Poll "${pollTitle}" is finalized``, a plain-text body and an `html` body that both include `finalSlotLabel` and a link to `shareUrl`. Wrap `this.transporter.sendMail({ from: this.from, to: email, subject, text, html })` in try/catch exactly like `sendMagicLink`: `this.logger.log(...)` on success, `this.logger.error(...)` then `throw err` on failure. Do NOT swallow the error here — `NotificationsService` is responsible for catching and recording failures.
2. Create `backend/src/notifications/notifications.service.ts`. Inject `private readonly prisma: PrismaService`, `private readonly mail: MailService`, `private readonly config: ConfigService`. Add `private readonly logger = new Logger(NotificationsService.name)`.
3. In `NotificationsService`, implement `async sendPollCompletedEmails(pollId: bigint, pollTitle: string, publicToken: string, finalSlotLabel: string): Promise<void>` (callable from Phase 2's complete endpoint). Inside:
   a. Read `const appUrl = this.config.getOrThrow<string>('APP_URL')` and `const shareUrl = buildShareUrl(appUrl, publicToken)` (import `buildShareUrl` from `../polls/public-token.util`).
   b. `const participants = await this.prisma.participant.findMany({ where: { pollId, email: { not: null } } })`. If `participants.length === 0`, log and return (zero emails, zero `email_log` rows).
   c. For each participant, call a private helper `sendOne(...)` so the loop continues even when one send fails.
4. Implement `private async sendOne(pollId, participant, pollTitle, finalSlotLabel, shareUrl)`:
   a. Idempotency reservation in a `$transaction`: `findUnique` on `email_log` by the compound unique `where: { pollId_participantId_type: { pollId, participantId: participant.id, type: EmailType.poll_completed } }`. If a row exists with `status === EmailStatus.sent`, log "already sent, skipping" and return WITHOUT calling `MailService`. If it exists with `failed`/`queued`, reuse its id; otherwise `create` a new row with `status: EmailStatus.queued` and the denormalized `toEmail: participant.email` (store the email even though `Participant.email` may later be cleared).
   b. After the transaction reserves/locates the `queued` row, call `await this.mail.sendPollCompleted(participant.email, pollTitle, finalSlotLabel, shareUrl)`.
   c. On success: `await this.prisma.emailLog.update({ where: { id }, data: { status: EmailStatus.sent, sentAt: new Date(), error: null } })` and `this.logger.log(...)`.
   d. On thrown error: `this.logger.error(...)` and `await this.prisma.emailLog.update({ where: { id }, data: { status: EmailStatus.failed, error: <message, truncated to 500 chars to fit VarChar(500)> } })`. Never rethrow — one failed participant must not abort the others.
   e. Import the enums via `import { EmailType, EmailStatus, Prisma } from '@prisma/client'` (or the project's generated client path used elsewhere) and handle `Prisma.PrismaClientKnownRequestError` with `error.code === 'P2002'` defensively on the `create` (concurrent reservation): on P2002, re-`findUnique` and treat as already-reserved/sent.
5. Create `backend/src/notifications/notifications.module.ts`: `@Module({ providers: [NotificationsService], exports: [NotificationsService] })`. No `imports` — `PrismaService` (global `PrismaModule`) and `MailService` (global `MailModule`) are already global; `ConfigService` is available app-wide via the root `ConfigModule`.
6. Register the module in `backend/src/app.module.ts` by adding `NotificationsModule` to the `imports` array (mirror how `MailModule`/`PollsModule` are listed).
7. Create `backend/src/notifications/notifications.service.spec.ts`. Build `prisma` as `Partial<PrismaService>` with typed `jest.fn()` for `participant.findMany`, `emailLog.findUnique`, `emailLog.create`, `emailLog.update`, and a `$transaction` impl that runs its callback with the mock tx client; build `mail` with a `jest.fn()` `sendPollCompleted`; build `config` with `getOrThrow` returning a fixed `APP_URL`. Reset/re-resolve mocks in `beforeEach`. Cover: (a) two participants with email → two `sendPollCompleted` calls + two `email_log` rows ending `sent`; participants without email excluded; (b) zero emailable participants → `sendPollCompleted` never called, no `email_log` writes; (c) existing `email_log` with `status: sent` → `sendPollCompleted` NOT called again (no double-send); (d) `sendPollCompleted` rejects → `email_log` updated to `failed` with `error` set and the loop still processes the next participant.

## Verification
- `cd backend && npm run lint`
- `cd backend && npm test -- notifications.service.spec`
- `cd backend && npm test -- mail.service.spec`
- Manual (after Phase 2 wires the endpoint, or via a throwaway script that calls `NotificationsService.sendPollCompletedEmails`): open Mailpit at http://localhost:8025 and confirm one completion email per emailable participant, that the body contains the final slot label and the `http://localhost:5173/p/{publicToken}` share link, and that triggering completion twice produces no duplicate emails.

## Acceptance
- [x] Completing a poll emails ONLY participants whose `email` is non-null — one completion email each, visible in Mailpit, none for participants without an email.
- [x] A poll with zero emailable participants sends zero emails and writes zero `email_log` rows.
- [x] Re-running the completion notification does not double-send: an existing `email_log` row with `status: sent` is skipped (no second Mailpit message).
- [x] The completion email renders the final slot label and the public share link `http://localhost:5173/p/{publicToken}` built from `APP_URL` via `buildShareUrl`.
- [x] A `MailService` send failure records `email_log.status = failed` with an `error` message and does not abort emails to the remaining participants.
