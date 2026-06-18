/**
 * Public (anonymous) poll endpoint module — thin typed wrappers over the shared fetch client, in the
 * same shape as `@/api/auth`. The raw `fetch` wiring (the `/api` base, `credentials: "include"`, and
 * the typed {@link ApiError} on a non-2xx response) lives in `@/lib/api/client`; the store calls
 * these, never `fetch` directly.
 *
 * The wire types are NOT redefined here — they already live in `@/lib/api/types` (mirrored from the
 * backend `public/dto/*` DTOs). We import and re-export them so the store/views have one import site.
 *
 * Backend contract (read from `backend/src/public/`):
 *   GET  /api/public/polls/:token          → PublicPoll            (404 on unknown token)
 *   POST /api/public/polls/:token/responses → { publicToken }      (201; 409 dup email; 400 bad slot)
 *   GET  /api/public/polls/:token/results   → PollResults          (404 on unknown token)
 *
 * NOTE: `submit` returns ONLY `{ publicToken }` (the participant's own edit token, distinct from the
 * poll's share token) — it does NOT return results. `PublicThanks` calls `getResults` separately.
 * The public endpoints need no cookie, but the shared client sends one uniformly — harmless here.
 */
import { get, post } from '@/lib/api/client'
import type {
  PollResults,
  PublicPoll,
  SubmitResponsesDto,
  SubmitResponsesResult,
} from '@/lib/api/types'

export type {
  Availability,
  PollResults,
  PollDate,
  PollSlot,
  PublicPoll,
  BestSlot,
  SlotTally,
  ResponseAnswer,
  SubmitResponsesDto,
  SubmitResponsesResult,
} from '@/lib/api/types'

/** `GET /api/public/polls/:token`. Resolves the sanitized {@link PublicPoll}; rejects 404 on unknown token. */
export function getPublicPoll(token: string): Promise<PublicPoll> {
  return get<PublicPoll>(`/public/polls/${encodeURIComponent(token)}`)
}

/**
 * `POST /api/public/polls/:token/responses`. Resolves `{ publicToken }` — the participant's own edit
 * token. Rejects with {@link ApiError} on a 409 (duplicate email), 400 (invalid/foreign slot id or
 * missing fields), or 404 (unknown token); the store surfaces those codes upward.
 */
export function submitResponses(
  token: string,
  payload: SubmitResponsesDto,
): Promise<SubmitResponsesResult> {
  return post<SubmitResponsesResult>(`/public/polls/${encodeURIComponent(token)}/responses`, payload)
}

/** `GET /api/public/polls/:token/results`. Live-computed best slot + per-slot tallies; 404 on unknown token. */
export function getResults(token: string): Promise<PollResults> {
  return get<PollResults>(`/public/polls/${encodeURIComponent(token)}/results`)
}
