# Phase 2: Complete and invite-message endpoints

**Plan:** [completion-notifications](00-overview.md)
**Depends on:** 01-notifications-module.md
**Execution:** solo

## Context
Close the poll loop: a creator completes a poll (sets the final slot), only participants who left an email get a completion email exactly once, and a copy-paste invite message is available. Phase 1 created `NotificationsModule`/`NotificationsService` (which fans out to participants `WHERE email IS NOT NULL`, writes `EmailLog` rows, and relies on `@@unique([pollId, participantId, type])` for idempotency) and added the completion email to `MailService`. This phase wires the two creator-facing HTTP entry points that drive that machinery: `POST /api/polls/:id/complete` and `GET /api/polls/:id/invite-message`, both owner-guarded.

## Objective
Add `POST /polls/:id/complete` (validate `finalSlotId` belongs to the poll, set `status=completed`/`finalSlotId`/`completedAt`, then trigger `NotificationsService`) and `GET /polls/:id/invite-message` (rendered text with the public share URL), both behind `PollOwnershipGuard`.

## Files to touch
- `backend/src/polls/dto/complete-poll.dto.ts` — new `CompletePollDto` with `finalSlotId: string` (`@IsNotEmpty()`, `@IsNumberString()`); BigInt ids arrive as strings.
- `backend/src/polls/polls.controller.ts` — add `complete()` (`POST :id/complete`, `@UseGuards(PollOwnershipGuard)`) and `inviteMessage()` (`GET :id/invite-message`, `@UseGuards(PollOwnershipGuard)`).
- `backend/src/polls/polls.service.ts` — add `complete(pollId, finalSlotId)` and `buildInviteMessage(pollId)`; validate the slot, transition status, call `NotificationsService`.
- `backend/src/polls/polls.module.ts` — import `NotificationsModule` (from phase 1) so `NotificationsService` is injectable into `PollsService`.
- `backend/src/polls/polls.service.spec.ts` — extend with cases for `complete` and `buildInviteMessage`.
- `backend/src/polls/polls.controller.spec.ts` — extend with the two new routes (mock service + guard).

## Steps
1. Create `backend/src/polls/dto/complete-poll.dto.ts`: `CompletePollDto` exposing `finalSlotId: string` decorated `@IsNotEmpty()` + `@IsNumberString()` (mirror the class-validator style in `dto/create-poll.dto.ts`); the controller converts it to BigInt via `parseId`.
2. In `polls.service.ts`, add `async complete(pollId: bigint, finalSlotId: bigint): Promise<Poll>`:
   - Run inside `prisma.$transaction(async (tx) => { ... })` for atomic read+write.
   - Refetch the poll: `tx.poll.findUnique({ where: { id: pollId } })`; throw `NotFoundException` if missing (defensive — guard already attached it).
   - Validate `finalSlotId` belongs to the poll by joining through the date hierarchy: `tx.pollSlot.findUnique({ where: { id: finalSlotId }, include: { pollDate: true } })` and assert `slot?.pollDate.pollId === pollId`; else `throw new BadRequestException('finalSlotId does not belong to this poll')`.
   - Idempotent transition: if `poll.status === PollStatus.completed`, return the poll as-is (no re-update, no re-notify). Only transition from `open`.
   - Else `tx.poll.update({ where: { id: pollId }, data: { status: PollStatus.completed, finalSlotId, completedAt: new Date() } })`.
   - After the transaction commits, call `this.notifications.notifyPollCompleted(pollId)` (phase 1 API; it filters `participant.email IS NOT NULL`, checks/creates `EmailLog` with `type = 'poll_completed'`, and is itself a no-op when no eligible participants or already-logged). Return the updated poll.
3. In `polls.service.ts`, add `async buildInviteMessage(pollId: bigint): Promise<{ message: string; shareUrl: string }>`:
   - `prisma.poll.findUnique({ where: { id: pollId } })`; `NotFoundException` if missing.
   - `const shareUrl = buildShareUrl(this.config.getOrThrow<string>('APP_URL'), poll.publicToken)` (import `buildShareUrl` from `./public-token.util`; inject `ConfigService` if not already present).
   - Return a rendered, copy-paste message embedding `poll.title` and `shareUrl`, e.g. `You're invited to vote on "${poll.title}". Pick your availability here: ${shareUrl}`.
4. In `polls.controller.ts`:
   - Add `@Post(':id/complete')` + `@UseGuards(PollOwnershipGuard)` method `complete(@Param('id') id: string, @Body() dto: CompletePollDto)` → `return this.polls.complete(this.parseId(id), this.parseId(dto.finalSlotId))`.
   - Add `@Get(':id/invite-message')` + `@UseGuards(PollOwnershipGuard)` method `inviteMessage(@Param('id') id: string)` → `return this.polls.buildInviteMessage(this.parseId(id))`.
   - Reuse the existing private `parseId` helper (BigInt parse → `NotFoundException` on non-numeric, no existence leak). Import `CompletePollDto`.
5. In `polls.module.ts`, add `NotificationsModule` to `imports` so `NotificationsService` is injectable into `PollsService`. (`MailModule` is `@Global`; `PrismaService` is global.)
6. Extend `polls.service.spec.ts`: mock `prisma.poll.findUnique`, `prisma.pollSlot.findUnique`, `prisma.poll.update`, and a `NotificationsService.notifyPollCompleted` jest mock. Cover: (a) happy path sets `status=completed`/`finalSlotId`/`completedAt` and calls `notifyPollCompleted`; (b) slot from another poll → `BadRequestException`, no update; (c) already-`completed` poll → returns without re-update and without re-calling `notifyPollCompleted`; (d) `buildInviteMessage` returns a string containing the share URL built from a `buildConfig` `APP_URL` fixture.
7. Extend `polls.controller.spec.ts`: with `PollsService` and `ConfigService` mocked and `PollOwnershipGuard` overridden to allow, assert `complete` forwards parsed BigInt ids and `inviteMessage` returns the service result.

## Verification
- `cd backend && npm run lint`
- `cd backend && npm test -- polls.service.spec polls.controller.spec`
- Manual: with the dev stack up, complete a poll that has participants with emails and confirm exactly one message per emailed participant appears in Mailpit (http://localhost:8025); then re-issue the same complete call and confirm no new messages appear. Endpoint smoke check:
  - `curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"finalSlotId":"<id>"}' http://localhost:3000/api/polls/<id>/complete`
  - `curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/polls/<id>/invite-message`

## Acceptance
- [x] `POST /polls/:id/complete` validates `finalSlotId` belongs to the poll, sets `status=completed`/`finalSlotId`/`completedAt`, and triggers notifications; a slot from another poll returns 400 and leaves the poll unchanged.
- [ ] Completing emails only participants with a non-null email (verified in Mailpit); a poll with zero participant emails sends zero emails.
- [ ] Re-completing an already-completed poll returns idempotently and does not double-send (no new Mailpit messages, no extra `EmailLog` rows).
- [x] `GET /polls/:id/invite-message` renders a copy-paste message containing the public share link `{APP_URL}/p/{publicToken}`.
- [x] Both endpoints sit behind `PollOwnershipGuard` (404 for missing/non-owned polls, no existence leak).
