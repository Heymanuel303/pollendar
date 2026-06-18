# Phase 1: Results aggregation endpoint + deterministic best slot

**Plan:** [best-slot-computation](00-overview.md)
**Depends on:** none (extends the public module from the public-poll-responses plan)
**Execution:** solo

## Context
Pollendar (NestJS 11 / Prisma 7 / MySQL 8.4) needs to compute the winning date/slot for a poll: per-slot tallies plus a single deterministic best slot. This phase builds the **canonical live aggregation** (queried fresh on every call — it does NOT read the `slot_tallies` cache, which is Phase 2) and exposes it via `GET /api/public/polls/:token/results`. The endpoint is anonymous (token is the only auth) and lives on the existing `PublicController`/`PublicService` in `backend/src/public`.

## Objective
Add a `getResults(token)` service method and a `GET polls/:token/results` controller handler that return per-slot tallies and the deterministic best slot, with a unit test reproducing the worked example.

## Files to touch
- `backend/src/public/dto/poll-results.dto.ts` — NEW. Result DTO interfaces: `SlotTallyResult` (`slotId: string`, `available`, `maybe`, `unavailable`, `score`) and `PollResults` (`best: { slotId: string; date: string; label: string | null; score: number } | null`, `slots: SlotTallyResult[]`).
- `backend/src/public/public.service.ts` — add `getResults(token: string): Promise<PollResults>`: look up poll by token (404 if missing), run the canonical aggregation, apply the 5-key tie-break, build the response shape.
- `backend/src/public/public.controller.ts` — add `@Get('polls/:token/results')` handler `getResults(@Param('token') token)` to the EXISTING `@Controller('public')` class (no guard).
- `backend/src/public/public.service.spec.ts` — add `describe('getResults')` block with the worked-example test, unknown-token 404, and zero-response-slot test (mocked `PrismaService`).

## Steps
1. **Create `backend/src/public/dto/poll-results.dto.ts`.** Export:
   ```ts
   export interface SlotTallyResult {
     slotId: string;
     available: number;
     maybe: number;
     unavailable: number;
     score: number;
   }
   export interface BestSlot {
     slotId: string;
     date: string;
     label: string | null;
     score: number;
   }
   export interface PollResults {
     best: BestSlot | null;
     slots: SlotTallyResult[];
   }
   ```
   `slotId` is typed `string` to match the wire shape (BigInt serialized by `BigIntSerializerInterceptor`); the service emits `bigint` and the interceptor stringifies, but typing as `string` documents the contract. `best` is `null` only when the poll has zero slots (defensive); otherwise always populated.

2. **Add `getResults` to `PublicService`.** Mirror `findByPublicToken` for the 404 path:
   ```ts
   const poll = await this.prisma.poll.findUnique({ where: { publicToken: token } });
   if (!poll) throw new NotFoundException();
   ```
   `NotFoundException` is already imported by `findByPublicToken`. `Prisma` is already imported from `@prisma/client`.

3. **Run the canonical aggregation (DESIGN §4) via `prisma.$queryRaw`.** Use `this.prisma.$queryRaw` with `Prisma.sql` and bind the poll id. Select the ordering columns too so the tie-break can be done in SQL deterministically:
   ```ts
   const rows = await this.prisma.$queryRaw<Array<{
     slot_id: bigint;
     available_count: bigint | number;
     maybe_count: bigint | number;
     unavailable_count: bigint | number;
     score: bigint | number;
     event_date: Date;
     start_time: Date | null;
     label: string | null;
   }>>(Prisma.sql`
     SELECT s.id AS slot_id,
            SUM(r.availability = 'available')   AS available_count,
            SUM(r.availability = 'maybe')       AS maybe_count,
            SUM(r.availability = 'unavailable') AS unavailable_count,
            (SUM(r.availability = 'available') * 2 + SUM(r.availability = 'maybe')) AS score,
            d.event_date AS event_date,
            s.start_time AS start_time,
            s.label      AS label
     FROM poll_slots s
     JOIN poll_dates d ON d.id = s.poll_date_id
     LEFT JOIN responses r ON r.poll_slot_id = s.id
     WHERE d.poll_id = ${poll.id}
     GROUP BY s.id, d.event_date, s.start_time, s.label
     ORDER BY score DESC,
              available_count DESC,
              unavailable_count ASC,
              event_date ASC,
              start_time ASC,
              s.id ASC
   `);
   ```
   - **LEFT JOIN** is mandatory: slots with zero responses must still appear with all-zero `SUM(...)` (which yields `0`, not dropped).
   - `SUM(availability = 'value')` exploits MySQL boolean-as-1/0 — do NOT use `COUNT(IF(...))`.
   - Raw `SUM(...)` may come back as `string`/`BigInt`/`Decimal`; coerce every count and the score with `Number(...)` when building the DTO.
   - The full 5-key `ORDER BY` makes the first row the deterministic best slot. The final `s.id ASC` is the ultimate tiebreak.

4. **Build the DTO from `rows`.** Map each row:
   ```ts
   const slots = rows.map((r) => ({
     slotId: r.slot_id,                       // bigint -> interceptor stringifies
     available: Number(r.available_count),
     maybe: Number(r.maybe_count),
     unavailable: Number(r.unavailable_count),
     score: Number(r.score),
   }));
   ```
   Because of the SQL `ORDER BY`, `rows[0]` is the best slot:
   ```ts
   const top = rows[0];
   const best = top
     ? {
         slotId: top.slot_id,                 // bigint -> stringified
         date: <ISO date string from top.event_date>,
         label: top.label,
         score: Number(top.score),
       }
     : null;
   return { best, slots };
   ```
   For `date`, format `event_date` as a `YYYY-MM-DD` string (e.g. slice the ISO string) to match the `@db.Date` semantics; do not return a raw `Date` object.

   Note: `slotId` is emitted as raw `bigint`; the global `BigIntSerializerInterceptor` converts it to a string on the wire, so the runtime value in the service is `bigint` but the response contract (and DTO type) is `string`. The unit test asserts against the `bigint` returned by the mocked method (e.g. `BigInt(...)`), since the interceptor is not exercised in a unit test — assert `result.best.slotId === slotIdA` where `slotIdA` is the `bigint` the mock returned, and document that the interceptor stringifies it in transit.

5. **Add the controller handler.** In the existing `@Controller('public')` class in `public.controller.ts`:
   ```ts
   @Get('polls/:token/results')
   getResults(@Param('token') token: string) {
     return this.publicService.getResults(token);
   }
   ```
   With the global `/api` prefix the route is `GET /api/public/polls/:token/results`. No guard, no `@HttpCode` (default 200).

6. **Add unit tests in `public.service.spec.ts`** (mocked `PrismaService` — extend the existing mock so `poll.findUnique` and `$queryRaw` are `jest.fn()`):
   - **Worked example (mandatory):** mock `poll.findUnique` to resolve a poll with `id: 1n`. Mock `$queryRaw` to resolve the rows already ordered by the 5-key sort as the real SQL would (the service trusts SQL ordering, so the test feeds rows in DB-sorted order):
     - A = `{ slot_id: 10n, available_count: 3, maybe_count: 0, unavailable_count: 1, score: 6, ... }`
     - B = `{ slot_id: 11n, available_count: 2, maybe_count: 2, unavailable_count: 0, score: 6, ... }`
     - C = `{ slot_id: 12n, available_count: 2, maybe_count: 1, unavailable_count: 1, score: 5, ... }`
     A and B tie on score 6; tiebreak #2 (`available_count` desc) puts A (3) before B (2), so A is first and C is last. Assert `result.best.slotId === 10n`, `result.slots[0].slotId === 10n`, `result.slots[2].slotId === 12n`, and that scores coerce to numbers (`result.slots[0].score === 6`).
     - Add an assertion that demonstrates coercion: feed at least one count as a string (e.g. `available_count: '3'`) and assert the DTO value is the number `3` (`typeof === 'number'`).
   - **Unknown token -> 404:** mock `poll.findUnique` to resolve `null`; assert `getResults('bad')` rejects with `NotFoundException`. Assert `$queryRaw` was NOT called.
   - **Zero-response slot:** include a row with all counts `0` and `score: 0` (e.g. `slot_id: 99n`); assert it appears in `result.slots` with `available === 0`, `maybe === 0`, `unavailable === 0`, `score === 0`.

## Verification
- `npm run lint` (in backend/)
- `npm test -- public.service` (in backend/) — worked-example, 404, and zero-response tests green
- Optional manual: `curl -s http://localhost:3000/api/public/polls/<token>/results | jq` after `npm run start:dev`; confirm `best.slotId` and every `slots[].slotId` are JSON strings and `best` matches the highest-scored slot.

## Acceptance
- [x] `GET /api/public/polls/:token/results` returns `{ best, slots }`; for the worked example (A=3/0/1, B=2/2/0, C=2/1/1) `best.slotId` resolves to A via the score-tie -> available_count tiebreak, C is third, a zero-response slot appears with all-zero tallies, all `slotId` values serialize as strings, and an unknown token yields 404.
