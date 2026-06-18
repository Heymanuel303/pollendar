import { describe, it, expect } from 'vitest'
import { formatDate, formatDayNumber, formatTime, formatSlotRange, localZoneLabel } from '../timezone'
import type { PollSlot } from '@/lib/api/types'

function slot(overrides: Partial<PollSlot>): PollSlot {
  return {
    id: '1',
    startTime: null,
    endTime: null,
    isAllDay: false,
    label: null,
    sortOrder: 0,
    ...overrides,
  }
}

describe('formatTime', () => {
  it('renders a HH:mm wall-clock time in 24-hour form', () => {
    expect(formatTime('18:00', 'Europe/Brussels')).toBe('18:00')
  })

  it('accepts HH:mm:ss and drops the seconds', () => {
    expect(formatTime('08:30:45', 'America/New_York')).toBe('08:30')
  })
})

describe('formatDate', () => {
  it('renders a YYYY-MM-DD date as a comma-less weekday/month/day label', () => {
    // 2026-06-26 is a Friday; the value is timezone-independent (anchored in UTC).
    expect(formatDate('2026-06-26', 'Europe/Brussels')).toBe('Fri Jun 26')
  })

  it('accepts a full UTC-midnight ISO instant (the @db.Date wire shape) identically', () => {
    // GET /api/polls/:id serializes eventDate as "2026-06-19T00:00:00.000Z".
    // 2026-06-19 is a Friday.
    expect(formatDate('2026-06-19T00:00:00.000Z')).toBe('Fri Jun 19')
    expect(formatDate('2026-06-19T00:00:00.000Z')).toBe(formatDate('2026-06-19'))
  })

  it('degrades gracefully (no throw) on a malformed date value', () => {
    // A non-date string must never crash the render with a RangeError.
    expect(() => formatDate('garbage')).not.toThrow()
    expect(() => formatDayNumber('garbage')).not.toThrow()
  })
})

describe('formatDayNumber', () => {
  it('returns the day-of-month with no leading zero for a YYYY-MM-DD date', () => {
    expect(formatDayNumber('2026-06-19')).toBe('19')
  })

  it('returns the same day number for a full ISO instant as for the plain date', () => {
    expect(formatDayNumber('2026-06-19T00:00:00.000Z')).toBe('19')
    expect(formatDayNumber('2026-06-19T00:00:00.000Z')).toBe(formatDayNumber('2026-06-19'))
  })
})

describe('formatSlotRange', () => {
  it('collapses a start/end pair into a dash range', () => {
    expect(formatSlotRange(slot({ startTime: '18:00', endTime: '20:00' }), 'Europe/Brussels')).toBe(
      '18:00–20:00',
    )
  })

  it('renders a single start time when there is no end', () => {
    expect(formatSlotRange(slot({ startTime: '18:00' }), 'Europe/Brussels')).toBe('18:00')
  })

  it('renders "All day" for an all-day slot', () => {
    expect(formatSlotRange(slot({ isAllDay: true }), 'Europe/Brussels')).toBe('All day')
  })

  it('renders "All day" when there is no start time', () => {
    expect(formatSlotRange(slot({}), 'Europe/Brussels')).toBe('All day')
  })
})

describe('localZoneLabel', () => {
  it('returns a non-empty IANA-style zone string', () => {
    expect(localZoneLabel()).toMatch(/\w/)
  })
})
