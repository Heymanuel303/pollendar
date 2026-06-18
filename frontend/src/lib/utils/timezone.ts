/**
 * Timezone-aware formatting for poll dates and slot times, using only native `Intl.DateTimeFormat`
 * (no extra tz dependency).
 *
 * Poll `eventDate` (`"YYYY-MM-DD"`) and slot times (`"HH:mm[:ss]"`) are *naive* values already
 * expressed in the poll's IANA `timeZone` (the backend stores them as `@db.Date` / `@db.Time` with
 * no offset). They are therefore rendered faithfully by anchoring to a fixed UTC instant and
 * formatting in UTC — this never shifts the day or hour. The `timeZone` argument documents the zone
 * the value belongs to (and lets callers re-render in another zone later); see {@link localZoneLabel}.
 */

import type { PollSlot } from '@/lib/api/types'

/** Format a `"YYYY-MM-DD"` calendar date as e.g. `"Thu Jun 26"`. */
export function formatDate(eventDate: string, _timeZone?: string): string {
  const [year, month, day] = eventDate.split('-').map(Number)
  const anchor = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  // "Fri, Jun 26" → "Fri Jun 26" to match the mockup's comma-less style.
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
    .format(anchor)
    .replace(/,/g, '')
}

/**
 * Format a wall-clock time as a 24-hour `"18:00"` label. Accepts either a bare `"HH:mm[:ss]"` string
 * or a full ISO instant — the latter is the wire shape of a poll slot's `@db.Time` column, which
 * Prisma anchors to `1970-01-01` and serializes as e.g. `"1970-01-01T18:00:00.000Z"`.
 *
 * Both forms are rendered anchored in **UTC** so the stored wall-clock digits are preserved verbatim.
 * The slot time is already a *naive* value expressed in the poll's `timeZone`, so re-projecting it
 * through `poll.timezone` here would double-shift it; the `timeZone` arg is kept for documentation
 * (and future re-rendering) only — see the file header.
 */
export function formatTime(value: string, _timeZone?: string): string {
  const anchor = value.includes('T')
    ? new Date(value)
    : (() => {
        const [hours, minutes, seconds] = value.split(':').map(Number)
        return new Date(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0, seconds ?? 0))
      })()
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(anchor)
}

/** Collapse a slot's start/end into `"18:00–20:00"`, a single `"18:00"`, or `"All day"`. */
export function formatSlotRange(slot: PollSlot, timeZone?: string): string {
  if (slot.isAllDay || !slot.startTime) {
    return 'All day'
  }
  const start = formatTime(slot.startTime, timeZone)
  if (!slot.endTime) {
    return start
  }
  return `${start}–${formatTime(slot.endTime, timeZone)}`
}

/** The viewer's local IANA timezone, e.g. `"Europe/Brussels"`. */
export function localZoneLabel(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** The viewer's local IANA timezone — the default zone a new poll is created in. Falls back to `"UTC"`. */
export function defaultTimezone(): string {
  return localZoneLabel() || 'UTC'
}

/** A small, always-present zone list for runtimes without `Intl.supportedValuesOf`. */
const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/Brussels',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
]

/**
 * Every IANA zone the runtime knows (`Intl.supportedValuesOf('timeZone')`), or a small hardcoded
 * list when that API is unavailable. The viewer's own zone is guaranteed present (it is merged into
 * the fallback so the editor's default selection always has a matching `<option>`).
 */
export function commonTimezones(): string[] {
  try {
    const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf
    const zones = supportedValuesOf?.('timeZone')
    if (zones && zones.length > 0) return zones
  } catch {
    // Old runtime without supportedValuesOf — fall through to the hardcoded list.
  }
  const local = localZoneLabel()
  return local && !FALLBACK_TIMEZONES.includes(local)
    ? [local, ...FALLBACK_TIMEZONES]
    : FALLBACK_TIMEZONES
}

/** Day-of-month of a `"YYYY-MM-DD"` date, no leading zero — e.g. `"26"` (for the date chip). */
export function formatDayNumber(eventDate: string): string {
  const [year, month, day] = eventDate.split('-').map(Number)
  const anchor = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(anchor)
}

/**
 * Humanize a "responses close" value (`"YYYY-MM-DDTHH:mm"` from a `datetime-local` input, or a full
 * ISO instant) as e.g. `"Thu Jun 25, 18:00"`. The wall-clock value is rendered verbatim (anchored in
 * UTC), so the preview shows exactly what the creator typed; the `timeZone` arg documents the zone
 * the value belongs to. Returns the input unchanged if it doesn't parse.
 */
export function formatCloseLabel(iso: string, _timeZone?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return iso
  const [, year, month, day, hour, minute] = match
  const anchor = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  )
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
    .format(anchor)
    .replace(/,/g, '')
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(anchor)
  return `${date}, ${time}`
}

/**
 * A sensible default `"YYYY-MM-DD"` for a newly added candidate date: the day after
 * `afterIsoDate`, or tomorrow when omitted. Keeps each "+ Add date" one day ahead of the last.
 */
export function nextCandidateDate(afterIsoDate?: string): string {
  const base = afterIsoDate ? new Date(`${afterIsoDate}T00:00:00Z`) : new Date()
  base.setUTCDate(base.getUTCDate() + 1)
  return base.toISOString().slice(0, 10)
}
