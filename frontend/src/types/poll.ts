/**
 * Input shapes for composing and creating a poll. These mirror the backend create DTOs
 * (`backend/src/polls/dto/create-poll.dto.ts`) field-for-field — the editor builds a
 * {@link CreatePollPayload} and POSTs it to `/api/polls`.
 *
 * The *response* wire types (the created-poll summary, the full poll, results, …) live in
 * `@/lib/api/types`; this file holds only the editor-side **input** types plus a re-export of the
 * thin create result. All ids are `string` (the backend serializes its BigInt ids as strings).
 *
 * Note: `closesAt` is intentionally absent from {@link CreatePollPayload} — it is **PATCH-only**
 * (`update-poll.dto.ts`), not accepted by `POST /polls`. The editor surfaces it in the UI and sets
 * it via a later `PATCH /polls/:id`.
 */

import type { PollSummary } from '@/lib/api/types'

/** One time slot on a candidate date. Absent `startTime`/`endTime` ⇒ open-ended / all-day. */
export interface PollSlotInput {
  startTime?: string
  endTime?: string
  isAllDay?: boolean
  label?: string
  sortOrder?: number
}

/** One candidate date (`eventDate` is `"YYYY-MM-DD"`) with at least one slot. */
export interface PollDateInput {
  eventDate: string
  sortOrder?: number
  slots: PollSlotInput[]
}

/** Body of `POST /api/polls`. `timezone` defaults to `"UTC"` server-side when omitted. */
export interface CreatePollPayload {
  title: string
  description?: string
  timezone?: string
  dates: PollDateInput[]
}

/** Thin 201 result of `POST /api/polls` — a freshly created poll is always `open`. */
export type CreatedPoll = PollSummary

/** One slot in an edit payload. `id` present ⇒ existing row; absent ⇒ brand-new slot. `invalidatedAt`
 *  is a non-null ISO instant to deactivate, `null`/absent to keep active (or reactivate). */
export interface UpdatePollSlotInput {
  id?: string
  startTime?: string
  endTime?: string
  isAllDay?: boolean
  label?: string
  invalidatedAt?: string | null
}

/** One date in an edit payload, with its slots. `id`/`invalidatedAt` semantics as above; invalidating
 *  a date logically invalidates all of its slots. */
export interface UpdatePollDateInput {
  id?: string
  eventDate: string
  slots: UpdatePollSlotInput[]
  invalidatedAt?: string | null
}

/**
 * Body of `PATCH /api/polls/:id`. Every field is optional — send only what changed. Scalar fields
 * (`title`/`description`/`timezone`/`closesAt`) patch in place. `dates`, when present, is the FULL
 * desired nested tree; the backend diffs it against the stored tree by `id`. A date/slot that already
 * has >=1 response is IMMUTABLE in place — to change such a slot the creator marks it `invalidatedAt`
 * and adds a replacement (new row, no `id`). `closesAt` is an ISO instant or `null` to clear it. Only
 * valid while the poll is `open` (backend returns 409 otherwise).
 */
export interface UpdatePollPayload {
  title?: string
  description?: string | null
  timezone?: string
  closesAt?: string | null
  dates?: UpdatePollDateInput[]
}
