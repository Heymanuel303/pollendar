# Phase 1: Public poll fetch by token

**Plan:** [public-poll-responses](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Anonymous participants need to open a poll via its public share link and see what they can respond to, without authenticating. This phase stands up the new `PublicModule` and the read half of that flow: a sanitized `GET /api/public/polls/:token` that returns a poll's dates and slots while leaking neither participant emails nor the owner's `userId`. The write half (anonymous response submission) lands in a later phase. Feature goal recap: anonymous participants can view a poll by its public token and submit their availability.

## Objective
Add `PublicModule` with a `GET /api/public/polls/:token` endpoint that returns a sanitized poll (id, title, description, timezone, status, dates → slots) and 404s on any unknown or invalid token.

## Files to touch
- `backend/src/public/public.module.ts` — new `@Module` declaring `PublicController` + `PublicService` (no JwtModule, no guards — anonymous).
- `backend/src/public/public.service.ts` — new `@Injectable` `PublicService` with `findByPublicToken(token: string)`: `prisma.poll.findUnique({ where: { publicToken: token }, include: { dates: { orderBy: { sortOrder: 'asc' }, include: { slots: { orderBy: { sortOrder: 'asc' } } } } } })`, throws `NotFoundException` on null, returns a sanitized shape (no `userId`, no participant data).
- `backend/src/public/public.controller.ts` — new `@Controller('public')` with `@Get('polls/:token')` reading `@Param('token')`, delegating to the service. No `@UseGuards`.
- `backend/src/public/dto/public-poll.dto.ts` — response shape type/helper documenting the sanitized fields returned (id, title, description, timezone, status, dates[].{id,eventDate,sortOrder,slots[].{id,startTime,endTime,isAllDay,label,sortOrder}}).
- `backend/src/app.module.ts` — register `PublicModule` in the `imports` array.
- `backend/src/public/public.service.spec.ts` — new co-located unit spec for `PublicService`.
- `backend/src/public/public.controller.spec.ts` — new co-located unit spec for `PublicController`.

## Steps
0. Create the `backend/src/public/` and `backend/src/public/dto/` directories first (mirrors the `backend/src/polls/` + `backend/src/polls/dto/` layout) so the files below have a home.
1. Create `backend/src/public/public.service.ts`: `@Injectable() class PublicService` with `constructor(private readonly prisma: PrismaService)` (import from `../prisma/prisma.service`; PrismaModule is `@Global()` so no import needed in the module). Implement `async findByPublicToken(token: string)` that calls `this.prisma.poll.findUnique({ where: { publicToken: token }, include: { dates: { orderBy: { sortOrder: 'asc' }, include: { slots: { orderBy: { sortOrder: 'asc' } } } } } })`; if the result is null/undefined, `throw new NotFoundException()` (import from `@nestjs/common`). Map the row to a sanitized object that explicitly omits `userId`, `finalSlotId`, `closesAt`/`completedAt` if undesired, and includes only `{ id, title, description, timezone, status, dates }` where each date is `{ id, eventDate, sortOrder, slots: [...] }` and each slot is `{ id, startTime, endTime, isAllDay, label, sortOrder }`. Never include `participants`/`email`. Mirror the include/orderBy pattern from `backend/src/polls/polls.service.ts` `findOneForUser`.
2. Create `backend/src/public/dto/public-poll.dto.ts`: define an exported interface/type (e.g. `PublicPoll`, `PublicPollDate`, `PublicPollSlot`) describing the sanitized response shape from step 1, so the service return type is explicit and the omission of `userId`/email is enforced by the type. BigInt `id` fields stay `bigint` here — the global `BigIntSerializerInterceptor` stringifies them on the wire.
3. Create `backend/src/public/public.controller.ts`: **`@Controller('public')`** (→ routes under `/api/public`). This is the agreed base path for the whole `PublicController` — Phase 2 MUST reuse the same `@Controller('public')` and add its POST as `@Post('polls/:token/responses')`, NOT a second `@Controller('public/polls')`. Add `@Get('polls/:token')` method `getPoll(@Param('token') token: string)` that returns `this.public.findByPublicToken(token)`. Inject the service as `private readonly public: PublicService`. No `@UseGuards` — endpoint is anonymous. Token is a plain string param (not BigInt), so no `parseId`-style try/catch is needed; an unknown token simply yields a `findUnique` miss → 404 from the service.
4. Create `backend/src/public/public.module.ts`: `@Module({ controllers: [PublicController], providers: [PublicService] })`. Do NOT import `JwtModule`, do NOT register any guard (unlike `PollsModule`). `PrismaService` resolves via the global `PrismaModule`.
5. Register the module in `backend/src/app.module.ts`: add `import { PublicModule } from './public/public.module';` and append `PublicModule` to the `imports` array (after `PollsModule`).
6. Write `backend/src/public/public.service.spec.ts` mirroring the mock style in `backend/src/polls/polls.service.spec.ts`: a `jest.fn` for `poll.findUnique`, a `Partial<PrismaService>` mock. Assert: (a) a known token returns the sanitized shape with dates/slots ordered, and that the returned object has NO `userId` and NO `email`/`participants` keys; (b) `findUnique` was called with `{ where: { publicToken: token }, include: {...} }`; (c) a null result throws `NotFoundException`.
7. Write `backend/src/public/public.controller.spec.ts`: instantiate the controller with a mocked `PublicService`, assert `getPoll('tok')` delegates to `findByPublicToken('tok')` and returns its value.

## Verification
- `npm run lint` (in `backend/`)
- `npm test -- src/public` (in `backend/`) — path-scoped so it runs the two new co-located specs and fails loudly (rather than silently matching zero) if a file is misplaced.
- Manual: start the API, create a poll as a creator to obtain its `publicToken`, then `curl -s http://localhost:3000/api/public/polls/<token>` returns 200 with `dates`/`slots` and contains no `userId`/`email`; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/public/polls/does-not-exist` returns `404`.

## Acceptance
- [x] `GET /api/public/polls/:token` returns 200 with the sanitized poll (id, title, description, timezone, status, ordered dates → slots) for a valid token and 404 for an unknown/invalid token, with no `userId` and no participant email anywhere in the body; `PublicModule` is registered in `AppModule` and both new specs pass.
