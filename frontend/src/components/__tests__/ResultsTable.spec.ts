import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ResultsTable from '../ResultsTable.vue'
import type { PollResults, PollSlot, SlotMeta } from '@/lib/api/types'

const TZ = 'Europe/Brussels'

function slot(
  id: string,
  label: string | null,
  startTime: string | null,
  endTime: string | null,
): PollSlot {
  return { id, startTime, endTime, isAllDay: startTime === null, label, sortOrder: 0, invalidatedAt: null }
}

// Four slots scoring [10, 7, 6, 3]; the 10-score slot (s1) is the winner / in bloom.
const META: Record<string, SlotMeta> = {
  s1: { slot: slot('s1', 'Early', '18:00:00', '20:00:00'), date: '2026-06-26' },
  s2: { slot: slot('s2', 'Late', '20:00:00', '22:00:00'), date: '2026-06-26' },
  s3: { slot: slot('s3', null, null, null), date: '2026-06-27' },
  s4: { slot: slot('s4', 'Evening', '19:00:00', '22:00:00'), date: '2026-06-28' },
}
const RESULTS: PollResults = {
  best: { slotId: 's1', date: '2026-06-26', label: 'Early', score: 10 },
  slots: [
    { slotId: 's1', available: 5, maybe: 0, unavailable: 0, score: 10 },
    { slotId: 's2', available: 3, maybe: 1, unavailable: 1, score: 7 },
    { slotId: 's3', available: 2, maybe: 2, unavailable: 1, score: 6 },
    { slotId: 's4', available: 1, maybe: 1, unavailable: 3, score: 3 },
  ],
}

function mountTable() {
  return mount(ResultsTable, {
    props: { results: RESULTS, slotMetaById: META, order: ['s1', 's2', 's3', 's4'], timezone: TZ },
  })
}

const norm = (text: string) => text.replace(/\s+/g, ' ')

describe('ResultsTable', () => {
  it('blooms exactly one row — the best slot — with the ✦ In bloom pill', () => {
    const wrapper = mountTable()

    expect(wrapper.findAll('.bloom-bg')).toHaveLength(1)
    const winner = wrapper.get('[data-testid="result-row-s1"]')
    expect(winner.classes()).toContain('bloom-bg')
    expect(winner.text()).toContain('✦ In bloom')

    // No other row carries the bloom or the pill.
    const loser = wrapper.get('[data-testid="result-row-s2"]')
    expect(loser.classes()).not.toContain('bloom-bg')
    expect(loser.text()).not.toContain('In bloom')
  })

  it('sizes the distribution bar to count/total per slot', () => {
    const wrapper = mountTable()

    // s2: 3 yes / 1 maybe / 1 no → total 5 → 60% yes, 20% maybe.
    const row = wrapper.get('[data-testid="result-row-s2"]')
    expect(row.get('[data-bar="yes"]').attributes('style')).toContain('60%')
    expect(row.get('[data-bar="maybe"]').attributes('style')).toContain('20%')

    // s1: all 5 yes → 100% yes, 0% maybe.
    const winner = wrapper.get('[data-testid="result-row-s1"]')
    expect(winner.get('[data-bar="yes"]').attributes('style')).toContain('100%')
    expect(winner.get('[data-bar="maybe"]').attributes('style')).toContain('0%')
  })

  it('renders the numeric yes·maybe·no tally and the score for each row', () => {
    const wrapper = mountTable()

    expect(norm(wrapper.get('[data-testid="result-row-s2"]').text())).toContain(
      '3 yes · 1 maybe · 1 no',
    )
    expect(wrapper.get('[data-testid="result-row-s1"]').text()).toContain('10')
  })

  it('reports the participant count as the busiest slot total', () => {
    const wrapper = mountTable()
    // Every slot here has 5 responses.
    expect(norm(wrapper.text())).toContain('5 participants · best recomputed on every response')
  })

  // Phase 3 responsive pass: rows stack on phones, restore the 12-col grid at md+.
  it('stacks each row on phones and restores the 12-col grid at md+', () => {
    const row = mountTable().get('[data-testid="result-row-s1"]')
    // Mobile-first: a vertical flex column that becomes a 12-col grid at md.
    expect(row.classes()).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'md:grid', 'md:grid-cols-12', 'md:items-center']),
    )
    // The old desktop-only base spans must be gone (no overflow at 375px).
    expect(row.classes()).not.toContain('grid-cols-12')
  })

  it('scopes each row child column span to md+ so it is full-width on phones', () => {
    const row = mountTable().get('[data-testid="result-row-s1"]')
    const cols = row.findAll(':scope > div')
    // date · distribution · score blocks, each md-scoped (no unprefixed col-span).
    expect(cols.length).toBeGreaterThanOrEqual(3)
    for (const col of cols) {
      expect(col.classes().some((c) => c === 'col-span-5' || c === 'col-span-2')).toBe(false)
      expect(col.classes().some((c) => c.startsWith('md:col-span-'))).toBe(true)
    }
    // Score column left-aligns on phones, right-aligns at md+.
    const score = cols[cols.length - 1]!
    expect(score.classes()).toEqual(expect.arrayContaining(['text-left', 'md:text-right']))
  })
})
