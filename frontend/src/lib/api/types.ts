/**
 * Wire types for the Pollendar API. These mirror the backend DTOs exactly as serialized:
 * every `BigInt` id is a `string` (the backend's global BigIntSerializerInterceptor stringifies
 * them), and `availability` is the backend literal — `yes/maybe/no` is only UI-color naming.
 */

/** Poll lifecycle. Matches Prisma `PollStatus`. */
export type PollStatus = 'open' | 'completed' | 'cancelled'

/** A participant's answer for one slot. Matches Prisma `Availability`. */
export type Availability = 'available' | 'maybe' | 'unavailable'

/** Authenticated creator. From `GET /api/auth/me` and `POST /api/auth/verify` `{ user }`. */
export interface User {
  id: string
  email: string
  displayName: string | null
}

/** One time slot on a candidate date. `startTime`/`endTime` are `"HH:mm[:ss]"` (or null = all-day). */
export interface PollSlot {
  id: string
  startTime: string | null
  endTime: string | null
  isAllDay: boolean
  label: string | null
  sortOrder: number
}

/** One candidate date (`eventDate` is `"YYYY-MM-DD"`) with its slots. */
export interface PollDate {
  id: string
  eventDate: string
  sortOrder: number
  slots: PollSlot[]
}

/** Sanitized public poll view. From `GET /api/public/polls/:token`. */
export interface PublicPoll {
  id: string
  title: string
  description: string | null
  timezone: string
  status: PollStatus
  dates: PollDate[]
}

/** Thin create result with the shareable URL. From `POST /api/polls`. */
export interface PollSummary {
  id: string
  publicToken: string
  shareUrl: string
  title: string
  status: PollStatus
}

/** Full owned poll with nested dates + slots. From `GET /api/polls/:id`. */
export interface Poll {
  id: string
  title: string
  description: string | null
  timezone: string
  status: PollStatus
  publicToken: string
  closesAt: string | null
  finalSlotId: string | null
  createdAt: string
  updatedAt: string
  dates: PollDate[]
}

/** Per-slot tally. From `GET /api/public/polls/:token/results`. */
export interface SlotTally {
  slotId: string
  available: number
  maybe: number
  unavailable: number
  score: number
}

/** The deterministic best slot. From `GET /api/public/polls/:token/results`. */
export interface BestSlot {
  slotId: string
  date: string
  label: string | null
  score: number
}

/** Live results: best slot + per-slot tallies. From `GET /api/public/polls/:token/results`. */
export interface PollResults {
  /** `null` only when the poll has zero slots (defensive); otherwise always populated. */
  best: BestSlot | null
  slots: SlotTally[]
}

/** One answer in a participant submission. The slot field is `pollSlotId` (not `slotId`). */
export interface ResponseAnswer {
  pollSlotId: string
  availability: Availability
}

/** Anonymous availability submission. From the body of `POST /api/public/polls/:token/responses`. */
export interface SubmitResponsesDto {
  displayName: string
  email?: string
  answers: ResponseAnswer[]
}

/** Submit result: the participant's own token (distinct from the poll's URL token). */
export interface SubmitResponsesResult {
  publicToken: string
}
