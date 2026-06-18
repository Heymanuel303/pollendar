# Phase 2: Submit availability as an anonymous participant

**Plan:** [public-poll-responses](00-overview.md)
**Depends on:** [01-public-poll-fetch.md](01-public-poll-fetch.md)
**Execution:** solo

## Context
Feature goal: anonymous participants can view a poll by its public token and submit their availability; `PublicModule` exposes a sanitized GET and a transactional POST with UNIQUE enforcement. Phase 1 added `PublicModule`/`PublicController`/`PublicService` with the sanitized `GET /api/public/polls/:token` and wired the module into `app.module.ts`. This phase adds the write path: a single anonymous POST that creates a `Participant` plus one `Response` per slot inside one transaction. The DB already enforces `participants @@unique([pollId, email])` and `responses @@unique([participantId, pollSlotId])`, so no migration is needed.

## Objective
Add `POST /api/public/polls/:token/responses` that creates a participant and their per-slot responses in one transaction, maps the two distinct UNIQUE violations to `409`, and returns only the participant's `{ publicToken }`.

## Files to touch
- `backend/src/public/dto/submit-responses.dto.ts` — new DTO: `SubmitResponsesDto` (`displayName: string`, optional `email?: string`, `answers: ResponseAnswerDto[]`) and nested `ResponseAnswerDto` (`pollSlotId: string`, `availability: Availability`).
- `backend/src/public/public.service.ts` — add `submitResponses(token, dto)`: look up poll by `publicToken`, validate slot ids belong to the poll, create participant + responses in `prisma.$transaction`, map `P2002` to `ConflictException` by inspecting `error.meta.target`.
- `backend/src/public/public.controller.ts` — add `@Post(':token/responses')` handler delegating to the service; returns `{ publicToken }`.
- `backend/src/public/public.service.spec.ts` — co-located unit tests for the new service method (extend the Phase 1 spec file, or create it if absent).

## Steps
0. Pre-flight: confirm Phase 1 has been applied to the tree — `backend/src/public/public.module.ts`, `public.controller.ts`, and `public.service.ts` exist and `PublicModule` is registered in `backend/src/app.module.ts`. If not, execute Phase 1 first; this phase extends those files, it does not create the module.
1. In `backend/src/public/dto/submit-responses.dto.ts`, create `ResponseAnswerDto` with `@IsString() pollSlotId: string` (slot ids arrive as strings because `BigIntSerializerInterceptor` stringifies them in the Phase 1 GET) and `@IsEnum(Availability) availability: Availability` (import `Availability` from `@prisma/client`). Create `SubmitResponsesDto` with `@IsString() @MaxLength(120) displayName: string`, `@IsOptional() @IsEmail() @MaxLength(255) email?: string`, and `@IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ResponseAnswerDto) answers: ResponseAnswerDto[]`. Import `Type` from `class-transformer`; the global `ValidationPipe` (`transform: true` in `main.ts`) instantiates nested DTOs.
2. In `backend/src/public/public.service.ts`, add `async submitResponses(token: string, dto: SubmitResponsesDto)`:
   - Fetch the poll: `const poll = await this.prisma.poll.findUnique({ where: { publicToken: token }, include: { dates: { include: { slots: true } } } })`. If `null`, `throw new NotFoundException()`. (`:token` is a 22-char `CHAR` value — use it directly, do NOT parse as BigInt.)
   - Parse each `answers[].pollSlotId` to `bigint` inside `try { BigInt(id) } catch { throw new BadRequestException() }`; build the set of valid slot ids from the included slots and reject any answer whose slot does not belong to this poll with `BadRequestException` (prevents cross-poll writes; mirrors the no-leak 404/400 convention).
   - Generate the participant token with `generatePublicToken()` (imported from `../polls/public-token.util`).
   - Wrap creation in `return this.prisma.$transaction(async (tx) => { const participant = await tx.participant.create({ data: { pollId: poll.id, publicToken, displayName: dto.displayName, email: dto.email ?? null } }); await tx.response.createMany({ data: dto.answers.map((a) => ({ participantId: participant.id, pollSlotId: BigInt(a.pollSlotId), availability: a.availability })) }); return { publicToken: participant.publicToken }; })`.
   - Wrap the transaction in `try/catch`. On `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'`, inspect `err.meta?.target`: if it references the participant email/`pollId` constraint, `throw new ConflictException('A participant with this email already responded to this poll')`; otherwise (response slot constraint) `throw new ConflictException('Duplicate response for a slot')`. Re-throw anything else.
   - Import `BadRequestException` alongside the existing `ConflictException`/`NotFoundException`/`Injectable`, and `Prisma` + `Availability` from `@prisma/client`.
3. In `backend/src/public/public.controller.ts`, add a handler to the **existing `@Controller('public')`** class from Phase 1 (do NOT introduce a second `@Controller('public/polls')` — the GET and POST must share one controller and one base path):
   ```ts
   @Post('polls/:token/responses')
   async submit(@Param('token') token: string, @Body() dto: SubmitResponsesDto) {
     return this.public.submitResponses(token, dto);
   }
   ```
   Import `Body`, `Post` (and reuse `Param`) from `@nestjs/common` and `SubmitResponsesDto` from `./dto/submit-responses.dto`. NO guard (anonymous); with the `public` base path plus the global `/api` prefix the route is `/api/public/polls/:token/responses`.
4. In `backend/src/public/public.service.spec.ts`, add unit tests with a mocked `PrismaService` (mock `poll.findUnique` and `$transaction`):
   - returns `{ publicToken }` on a successful submission and calls `participant.create` + `response.createMany` within the transaction callback;
   - throws `NotFoundException` when `poll.findUnique` resolves `null`;
   - throws `BadRequestException` when an answer's `pollSlotId` is non-numeric or not a slot of the poll;
   - maps a thrown `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'` on the participant email constraint to `ConflictException`, and on the response slot constraint to `ConflictException` (assert the distinct messages);
   - asserts the result contains no `id`, `email`, or `userId` keys (no-leak guarantee).

## Verification
- `npm run lint` (in `backend/`)
- `npm test -- public.service` (in `backend/`)
- Manual curl (server running, `:token` from a real poll, slot ids from the Phase 1 GET):
  - `curl -i -X POST localhost:3000/api/public/polls/<token>/responses -H 'Content-Type: application/json' -d '{"displayName":"Ada","email":"ada@example.com","answers":[{"pollSlotId":"<slotId>","availability":"available"}]}'` → `201` with body `{"publicToken":"<22-char>"}`.
  - Re-POST the same `email` to the same poll → `409`.
  - POST with `availability:"bogus"` or empty `answers` → `400`.
  - POST to an unknown token → `404`.

## Acceptance
- [x] `POST /api/public/polls/:token/responses` creates a participant + one response per slot in a single transaction and returns `{ publicToken }` with status `201`, leaking no `id`/`email`/`userId`.
- [x] Duplicate email on the same poll returns `409`; a duplicate response on the same slot returns `409`; unknown token returns `404`; invalid body returns `400`.
- [x] `npm run lint` and `npm test -- public.service` pass.
