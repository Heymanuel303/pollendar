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

/** Format a `"HH:mm"` / `"HH:mm:ss"` wall-clock time as a 24-hour `"18:00"` label. */
export function formatTime(hms: string, _timeZone?: string): string {
  const [hours, minutes, seconds] = hms.split(':').map(Number)
  const anchor = new Date(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0, seconds ?? 0))
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
