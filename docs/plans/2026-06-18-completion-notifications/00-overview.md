# Completion, notifications & invite message (Phase 6)

**Slug:** `completion-notifications` (folder: `docs/plans/2026-06-18-completion-notifications/`)
**Created:** 2026-06-18
**Status:** completed

## Goal
Close the poll loop: a creator completes a poll by picking the final slot, only participants
who left an email receive a completion email exactly once (re-completing never double-sends),
and a copy-paste invite message with the public share link is available.

## Scope
- `backend/src/notifications` (new): `NotificationsModule` + `NotificationsService` — selects
  participants `WHERE email IS NOT NULL`, sends the completion email, records idempotent
  `email_log` rows.
- `backend/src/mail`: add `MailService.sendPollCompleted(...)` alongside `sendMagicLink`.
- `backend/src/polls`: `POST /polls/:id/complete` and `GET /polls/:id/invite-message` on
  `PollsController`/`PollsService`, both behind `PollOwnershipGuard`.
- `backend/src/app.module.ts`: register `NotificationsModule`.

## Out of scope
- New Prisma migration — `EmailLog` (with `@@unique([pollId, participantId, type])`),
  `Poll.finalSlotId/completedAt/status` already exist in `schema.prisma` from Phase 1.
- Frontend `ShareBox` / completion UI (Phase 7).

## Constraints
- Idempotency comes solely from the `email_log` `UNIQUE(poll_id, participant_id, type)`
  constraint; a `sent` row is never re-sent.
- Zero emailable participants ⇒ zero emails and zero `email_log` rows.
- Share link built from `APP_URL` via `buildShareUrl` → `http://localhost:5173/p/{publicToken}`.
- NestJS 11, Prisma 7 (driver adapter), MySQL 8.4; mail → Mailpit in dev. Mirror existing
  conventions: global `PrismaService`/`MailModule`, `ConfigService`, `PollOwnershipGuard`,
  class-validator DTOs, colocated `*.spec.ts`. Mind BigInt id serialization.

## Acceptance criteria
- [ ] Completing a poll emails only participants with a non-null email — one each, in Mailpit.
- [ ] A poll with zero participant emails sends zero emails.
- [ ] Re-completing does not double-send (no new Mailpit messages, no extra `email_log` rows).
- [x] `GET /polls/:id/invite-message` renders the copy-paste message with the share link.
- [x] Both endpoints sit behind `PollOwnershipGuard` (404, no existence leak).

## Phases
1. [01-notifications-module](01-notifications-module.md) — `NotificationsModule`/`Service`
   with idempotent `email_log` fan-out + `MailService.sendPollCompleted`. · _solo_ ✓
2. [02-complete-and-invite-endpoints](02-complete-and-invite-endpoints.md) — owner-guarded
   `POST :id/complete` (validate slot → transition → notify) + `GET :id/invite-message`. · _solo_ ✓

## Open questions
- **Reconcile the NotificationsService signature across the two phases before executing.**
  Phase 1 defines `sendPollCompletedEmails(pollId, pollTitle, publicToken, finalSlotLabel)`;
  Phase 2 calls `notifications.notifyPollCompleted(pollId)`. Pick one — recommended:
  a single-arg `notifyPollCompleted(pollId)` where `NotificationsService` itself loads the
  poll title, `publicToken`, and renders the final-slot label from `pollId` (keeps the
  complete endpoint thin and the service self-contained). Update Phase 1's method name/args
  to match when implementing it.
