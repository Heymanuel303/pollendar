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

/**
 * One time slot on a candidate date. `startTime`/`endTime` come off the wire as ISO instants anchored
 * to `1970-01-01` (the serialized form of the backend's `@db.Time` columns, e.g.
 * `"1970-01-01T18:00:00.000Z"`), or `null` when all-day. Render them with `formatTime`/`formatSlotRange`
 * from `@/lib/utils/timezone`, which read the wall-clock digits anchored in UTC.
 */
export interface PollSlot {
  id: string
  startTime: string | null
  endTime: string | null
  isAllDay: boolean
  label: string | null
  sortOrder: number
  /**
   * Soft-invalidation timestamp: `null` while the slot is active, an ISO instant once the creator
   * deactivated it. Invalidated slots keep their historical responses but are hidden from the public
   * voting view, excluded from results/best + the tally cache, and rejected by submission. Reversible:
   * clearing it (sending `invalidatedAt: null` in a `PATCH /polls/:id` `dates` row) reactivates the slot.
   */
  invalidatedAt: string | null
  /**
   * Per-slot response count, present on the CREATOR detail read (`GET /api/polls/:id`) as Prisma's
   * passed-through `_count` aggregate (Phase 2 emits `_count.responses`). The editor uses
   * `_count.responses > 0` to lock a voted slot from in-place edits. Absent on the sanitized public
   * view, so the field is OPTIONAL (keeps `PublicPoll` reuse + the list endpoint valid).
   */
  _count?: { responses: number }
}

/** One candidate date (`eventDate` is `"YYYY-MM-DD"`) with its slots. */
export interface PollDate {
  id: string
  eventDate: string
  sortOrder: number
  slots: PollSlot[]
  /**
   * Soft-invalidation timestamp: `null` while the date is active, an ISO instant once the creator
   * deactivated it. Invalidating a date logically invalidates all of its slots; its (and their)
   * historical responses are preserved. Reversible by sending `invalidatedAt: null` in a
   * `PATCH /polls/:id` `dates` row.
   */
  invalidatedAt: string | null
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
  /** Set when `status` becomes `completed` (the moment the creator finalized a slot); else `null`. */
  completedAt: string | null
  createdAt: string
  updatedAt: string
  dates: PollDate[]
}

/**
 * One slot lifted out of the poll's `dates[]` tree, paired with the `eventDate` it belongs to. The
 * manage view derives a `slotId → SlotMeta` map once so the results components can label a slot
 * (date + time/all-day + custom label) without re-walking `dates[].slots[]`. The `date` is the
 * `"YYYY-MM-DD"` `eventDate`; render it with `formatDate` from `@/lib/utils/timezone`.
 */
export interface SlotMeta {
  slot: PollSlot
  date: string
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

/**
 * One participant's answer for a single slot, from
 * `GET /api/public/polls/:token/participants-responses`. The slot field is `pollSlotId`
 * (matching the backend `ParticipantAnswer.pollSlotId`, same key as the submission
 * `ResponseAnswer.pollSlotId`). `pollSlotId` is a `string` — the backend emits raw `bigint`
 * and the global BigIntSerializerInterceptor stringifies it.
 */
export interface ParticipantResponseAnswer {
  pollSlotId: string
  availability: Availability
}

/**
 * One participant row: their public-safe `displayName` + every per-slot answer.
 * PRIVACY: `email` is NEVER present — the backend selects `{ id, displayName }` only.
 * `participantId` is a `string` (stringified `bigint`).
 */
export interface ParticipantRow {
  participantId: string
  displayName: string
  answers: ParticipantResponseAnswer[]
}

/**
 * Per-participant responses page. From `GET /api/public/polls/:token/participants-responses`.
 * `total` is the unfiltered participant count for the poll; `hasMore` is `offset + participants.length < total`.
 */
export interface ParticipantResponsesResult {
  participants: ParticipantRow[]
  total: number
  hasMore: boolean
}

/**
 * Ready-to-copy invite text + canonical share URL. From `GET /api/polls/:id/invite-message`.
 * `message` is the backend's minimal one-liner; the frontend `ShareBox` renders the fuller
 * DESIGN.md §7 template, but uses this `shareUrl` as the canonical link (never hard-codes localhost).
 */
export interface InviteMessage {
  message: string
  shareUrl: string
}
