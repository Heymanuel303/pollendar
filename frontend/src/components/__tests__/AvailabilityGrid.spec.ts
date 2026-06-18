import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AvailabilityGrid from '../AvailabilityGrid.vue'
import type { PollDate, PollResults, PollSlot } from '@/lib/api/types'

const TZ = 'Europe/Brussels'

function slot(
  id: string,
  label: string | null,
  startTime: string | null,
  endTime: string | null,
): PollSlot {
  return { id, startTime, endTime, isAllDay: startTime === null, label, sortOrder: 0 }
}

const DATES: PollDate[] = [
  {
    id: 'd1',
    eventDate: '2026-06-26',
    sortOrder: 0,
    slots: [
      slot('s1', 'Early', '18:00:00', '20:00:00'),
      slot('s2', 'Late', '20:00:00', '22:00:00'),
    ],
  },
  { id: 'd2', eventDate: '2026-06-27', sortOrder: 1, slots: [slot('s3', null, null, null)] },
  {
    id: 'd3',
    eventDate: '2026-06-28',
    sortOrder: 2,
    slots: [slot('s4', 'Evening', '19:00:00', '22:00:00')],
  },
]
const RESULTS: PollResults = {
  best: { slotId: 's1', date: '2026-06-26', label: 'Early', score: 10 },
  slots: [
    { slotId: 's1', available: 5, maybe: 0, unavailable: 0, score: 10 },
    { slotId: 's2', available: 3, maybe: 1, unavailable: 1, score: 7 },
    { slotId: 's3', available: 2, maybe: 2, unavailable: 1, score: 6 },
    { slotId: 's4', available: 1, maybe: 1, unavailable: 3, score: 3 },
  ],
}

function mountGrid() {
  return mount(AvailabilityGrid, { props: { dates: DATES, results: RESULTS, timezone: TZ } })
}

describe('AvailabilityGrid', () => {
  it('blooms exactly one column — the best slot', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('.bloom-bg')).toHaveLength(1)
    const bloom = wrapper.findAll('[data-testid="grid-bloom"]')
    expect(bloom).toHaveLength(1)
    expect(bloom[0]!.classes()).toContain('bloom-bg')
  })

  it('renders one dot per response in each column, by availability', () => {
    const wrapper = mountGrid()

    // tbody cells: [Tally label, s1, s2, s3, s4]
    const cells = wrapper.findAll('tbody td')
    const s1 = cells[1]!
    const s2 = cells[2]!

    expect(s1.findAll('[data-dot="yes"]')).toHaveLength(5)
    expect(s1.findAll('[data-dot="maybe"]')).toHaveLength(0)
    expect(s1.findAll('[data-dot="no"]')).toHaveLength(0)

    expect(s2.findAll('[data-dot="yes"]')).toHaveLength(3)
    expect(s2.findAll('[data-dot="maybe"]')).toHaveLength(1)
    expect(s2.findAll('[data-dot="no"]')).toHaveLength(1)
  })

  it('totals the dot counts across all columns from the tallies', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('[data-dot="yes"]')).toHaveLength(5 + 3 + 2 + 1)
    expect(wrapper.findAll('[data-dot="maybe"]')).toHaveLength(0 + 1 + 2 + 1)
    expect(wrapper.findAll('[data-dot="no"]')).toHaveLength(0 + 1 + 1 + 3)
  })

  it('renders no bloom when there is no winner', () => {
    const wrapper = mount(AvailabilityGrid, {
      props: { dates: DATES, results: { best: null, slots: RESULTS.slots }, timezone: TZ },
    })
    expect(wrapper.findAll('.bloom-bg')).toHaveLength(0)
  })
})
