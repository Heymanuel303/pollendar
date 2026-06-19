import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ParticipantMatrix from '../ParticipantMatrix.vue'
import AvailabilityToggle from '../AvailabilityToggle.vue'
import type { Availability, ParticipantRow, PollDate, PollSlot } from '@/lib/api/types'

const TZ = 'Europe/Brussels'

/**
 * jsdom omits `window.matchMedia`, which `useBreakpoint` reads at setup to pick the
 * desktop-table vs mobile-card-stack DOM branch. `stubMatchMedia(false)` reports every query as
 * unmatched → `isPhone` is true (mobile cards); `stubMatchMedia(true)` matches `min-width` queries
 * → `isPhone` is false (desktop table). The desktop-table suite uses the latter so its `tbody`
 * assertions keep targeting the real table branch.
 */
function stubMatchMedia(matches: boolean): void {
  const matchMedia = vi.fn<(query: string) => MediaQueryList>(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  )
  Object.defineProperty(window, 'matchMedia', {
    value: matchMedia,
    configurable: true,
    writable: true,
  })
}

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
]

const PARTICIPANTS: ParticipantRow[] = [
  {
    participantId: 'p1',
    displayName: 'Aïcha',
    answers: [
      { pollSlotId: 's1', availability: 'available' },
      { pollSlotId: 's2', availability: 'maybe' },
      // s3 intentionally unanswered → "—"
    ],
  },
  {
    participantId: 'p2',
    displayName: 'Bram',
    answers: [
      { pollSlotId: 's1', availability: 'unavailable' },
      { pollSlotId: 's3', availability: 'available' },
    ],
  },
]

function mountMatrix(overrides: Record<string, unknown> = {}) {
  return mount(ParticipantMatrix, {
    props: {
      dates: DATES,
      timezone: TZ,
      participants: PARTICIPANTS,
      winningSlotId: 's1',
      answers: {} as Record<string, Availability | null>,
      ...overrides,
    },
  })
}

describe('ParticipantMatrix (desktop table)', () => {
  // Desktop branch: `min-width` queries match → `isPhone` is false → the table renders.
  beforeEach(() => stubMatchMedia(true))

  it('renders the desktop table branch (not the card stack) at >=640px', () => {
    const wrapper = mountMatrix()
    expect(wrapper.find('[data-testid="matrix-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="matrix-cards"]').exists()).toBe(false)
  })

  it('renders a sticky left name column and a row per participant plus the You row', () => {
    const wrapper = mountMatrix()

    const bodyRows = wrapper.findAll('tbody tr')
    // You row + 2 participant rows.
    expect(bodyRows).toHaveLength(3)

    // The first body cell of every row is the sticky name column.
    for (const row of bodyRows) {
      const nameCell = row.find('td')
      expect(nameCell.classes()).toEqual(
        expect.arrayContaining(['sticky', 'left-0', 'z-10', 'bg-canvas']),
      )
    }

    // Participant display names are shown.
    const text = wrapper.text()
    expect(text).toContain('Aïcha')
    expect(text).toContain('Bram')
  })

  it('labels the voter own row with the yourName + a "you" tag', () => {
    const wrapper = mountMatrix({ yourName: 'Me' })
    const youRow = wrapper.findAll('tbody tr')[0]!
    expect(youRow.text()).toContain('Me')
    expect(youRow.text().toLowerCase()).toContain('you')
  })

  it('renders the editable You row with AvailabilityToggles when editable', () => {
    const wrapper = mountMatrix({ editable: true })
    const youRow = wrapper.findAll('tbody tr')[0]!
    // One toggle per slot column (3 slots).
    expect(youRow.findAllComponents(AvailabilityToggle)).toHaveLength(3)
  })

  it('emits update:answers with the slot id when a You-row toggle changes', async () => {
    const wrapper = mountMatrix({ editable: true })
    const youRow = wrapper.findAll('tbody tr')[0]!
    const firstToggle = youRow.findAllComponents(AvailabilityToggle)[0]!

    firstToggle.vm.$emit('update:modelValue', 'available')
    await wrapper.vm.$nextTick()

    const events = wrapper.emitted('update:answers')
    expect(events).toBeTruthy()
    expect(events![0]).toEqual(['s1', 'available'])
  })

  it('clears the answer (null) when the active option is re-tapped via the toggle', async () => {
    const wrapper = mountMatrix({ editable: true, answers: { s1: 'available' } })
    const youRow = wrapper.findAll('tbody tr')[0]!
    const firstToggle = youRow.findAllComponents(AvailabilityToggle)[0]!

    // Re-tapping the active "Yes" cycles back to null (AvailabilityToggle behavior).
    await firstToggle.findAll('button')[0]!.trigger('click')

    const events = wrapper.emitted('update:answers')
    expect(events![0]).toEqual(['s1', null])
  })

  it('renders read-only glyphs in the You row (no toggles) when not editable', () => {
    const wrapper = mountMatrix({ editable: false, answers: { s1: 'available', s2: 'maybe' } })
    const youRow = wrapper.findAll('tbody tr')[0]!
    expect(youRow.findAllComponents(AvailabilityToggle)).toHaveLength(0)
    expect(youRow.find('[data-availability="available"]').exists()).toBe(true)
    expect(youRow.find('[data-availability="maybe"]').exists()).toBe(true)
  })

  it('renders the correct yes/maybe/no glyph (or — for no answer) per participant cell', () => {
    const wrapper = mountMatrix()
    const rows = wrapper.findAll('tbody tr')
    const aichaRow = rows[1]! // p1
    const bramRow = rows[2]! // p2

    // Aïcha: s1 yes, s2 maybe, s3 unanswered.
    expect(aichaRow.find('[data-availability="available"]').exists()).toBe(true)
    expect(aichaRow.find('[data-availability="maybe"]').exists()).toBe(true)
    expect(aichaRow.find('[data-availability="none"]').exists()).toBe(true)
    expect(aichaRow.find('[data-availability="none"]').text()).toBe('—')

    // Bram: s1 no, s3 yes.
    expect(bramRow.find('[data-availability="unavailable"]').exists()).toBe(true)
    expect(bramRow.findAll('[data-availability="available"]')).toHaveLength(1)
  })

  it('exposes accessible aria-labels per cell glyph', () => {
    const wrapper = mountMatrix()
    const aichaRow = wrapper.findAll('tbody tr')[1]!
    expect(aichaRow.find('[data-availability="available"]').attributes('aria-label')).toBe('Yes')
    expect(aichaRow.find('[data-availability="maybe"]').attributes('aria-label')).toBe('Maybe')
    expect(aichaRow.find('[data-availability="none"]').attributes('aria-label')).toBe('No answer')
  })

  it('never exposes participant email (privacy: displayName only)', () => {
    const wrapper = mountMatrix()
    expect(wrapper.text()).not.toMatch(/@/)
  })

  it('blooms only the winning slot column with the matrix-bloom test hook', () => {
    const wrapper = mountMatrix({ winningSlotId: 's1' })
    const bloomed = wrapper.findAll('[data-testid="matrix-bloom"]')
    // s1 cell in the You row + one per participant row = 3.
    expect(bloomed).toHaveLength(3)
    for (const cell of bloomed) {
      expect(cell.classes()).toContain('bloom-bg')
    }
  })

  it('renders no bloom when there is no winning slot', () => {
    const wrapper = mountMatrix({ winningSlotId: null })
    expect(wrapper.findAll('.bloom-bg')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="matrix-bloom"]')).toHaveLength(0)
  })

  it('shows an empty state but keeps the editable You row when there are no participants', () => {
    const wrapper = mountMatrix({ participants: [], editable: true })
    expect(wrapper.text()).toContain('No responses yet')
    // Only the You row remains in the body.
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAllComponents(AvailabilityToggle)).toHaveLength(3)
  })
})

describe('ParticipantMatrix (mobile card stack)', () => {
  // Mobile branch: no `min-width` query matches → `isPhone` is true → the card stack renders.
  beforeEach(() => stubMatchMedia(false))

  it('renders the card stack branch (not the table) at <640px', () => {
    const wrapper = mountMatrix()
    expect(wrapper.find('[data-testid="matrix-cards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="matrix-table"]').exists()).toBe(false)
  })

  it('renders one full-width card per slot in poll order with no horizontal scroll', () => {
    const wrapper = mountMatrix()
    const cards = wrapper.findAll('article')
    // 3 slots across the two dates → 3 cards.
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.classes()).toContain('w-full')
    }
    // The desktop horizontal-scroll wrapper + table must never render in the mobile branch.
    expect(wrapper.find('.overflow-x-auto').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('places the voter tri-state AvailabilityToggle inline at the top of each card', () => {
    const wrapper = mountMatrix({ editable: true, answers: { s1: 'available' } })
    const toggles = wrapper.findAllComponents(AvailabilityToggle)
    // One toggle per slot card.
    expect(toggles).toHaveLength(3)
    // First card's toggle reflects the shared `answers` state (single source of truth).
    expect(toggles[0]!.props('modelValue')).toBe('available')
  })

  it('emits update:answers from the inline card toggle with the slot id', async () => {
    const wrapper = mountMatrix({ editable: true })
    const firstToggle = wrapper.findAllComponents(AvailabilityToggle)[0]!

    firstToggle.vm.$emit('update:modelValue', 'maybe')
    await wrapper.vm.$nextTick()

    const events = wrapper.emitted('update:answers')
    expect(events).toBeTruthy()
    expect(events![0]).toEqual(['s1', 'maybe'])
  })

  it('disables the inline card toggle when not editable (closed poll)', () => {
    const wrapper = mountMatrix({ editable: false })
    const firstToggle = wrapper.findAllComponents(AvailabilityToggle)[0]!
    expect(firstToggle.props('disabled')).toBe(true)
  })

  it('groups participant name chips under Yes / Maybe / No per slot (displayName only)', () => {
    const wrapper = mountMatrix()
    const firstCard = wrapper.findAll('article')[0]! // slot s1
    // Aïcha is Yes for s1, Bram is No for s1.
    expect(firstCard.text()).toContain('Aïcha')
    expect(firstCard.text()).toContain('Bram')
    // Never any email.
    expect(firstCard.text()).not.toMatch(/@/)
  })

  it('renders a "No one yet" placeholder for an empty answer group', () => {
    const wrapper = mountMatrix()
    // s2 has only a "maybe" (Aïcha) and nobody Yes/No → the Yes & No groups are empty.
    const secondCard = wrapper.findAll('article')[1]! // slot s2
    expect(secondCard.text()).toContain('No one yet')
  })

  it('blooms only the winning slot card', () => {
    const wrapper = mountMatrix({ winningSlotId: 's1' })
    const bloomed = wrapper.findAll('[data-testid="matrix-card-bloom"]')
    expect(bloomed).toHaveLength(1)
    expect(bloomed[0]!.classes()).toContain('bloom-bg')
  })

  it('renders no bloomed card when there is no winning slot', () => {
    const wrapper = mountMatrix({ winningSlotId: null })
    expect(wrapper.findAll('[data-testid="matrix-card-bloom"]')).toHaveLength(0)
    expect(wrapper.findAll('.bloom-bg')).toHaveLength(0)
  })

  it('collapses overflow names behind an accessible +N more button that expands on tap', async () => {
    // 8 participants all Yes for s1 → first 6 chips + a "+2 more" control.
    const many: ParticipantRow[] = Array.from({ length: 8 }, (_, i) => ({
      participantId: `m${i}`,
      displayName: `Person ${i}`,
      answers: [{ pollSlotId: 's1', availability: 'available' as Availability }],
    }))
    const wrapper = mountMatrix({ participants: many })
    const firstCard = wrapper.findAll('article')[0]!

    const moreBtn = firstCard.find('button[aria-expanded]')
    expect(moreBtn.exists()).toBe(true)
    expect(moreBtn.text()).toContain('+2 more')
    expect(moreBtn.attributes('aria-expanded')).toBe('false')
    // Before expansion only 6 of the 8 names show.
    expect(firstCard.text()).not.toContain('Person 7')

    await moreBtn.trigger('click')
    expect(firstCard.text()).toContain('Person 7')
    const expandedBtn = firstCard.find('button[aria-expanded]')
    expect(expandedBtn.attributes('aria-expanded')).toBe('true')
  })

  it('marks every tappable control with the touch-target utility (>=44px)', () => {
    const many: ParticipantRow[] = Array.from({ length: 8 }, (_, i) => ({
      participantId: `m${i}`,
      displayName: `Person ${i}`,
      answers: [{ pollSlotId: 's1', availability: 'available' as Availability }],
    }))
    const wrapper = mountMatrix({ participants: many })
    const firstCard = wrapper.findAll('article')[0]!
    // The toggle wrapper carries touch-target.
    expect(firstCard.find('.touch-target').exists()).toBe(true)
    // The +N more button itself carries touch-target.
    const moreBtn = firstCard.find('button[aria-expanded]')
    expect(moreBtn.classes()).toContain('touch-target')
  })

  it('shows the shared empty state when there are no participants', () => {
    const wrapper = mountMatrix({ participants: [] })
    expect(wrapper.text()).toContain('No responses yet')
    // Cards still render (so the voter can still vote), each with the inline toggle.
    expect(wrapper.findAll('article')).toHaveLength(3)
    expect(wrapper.findAllComponents(AvailabilityToggle)).toHaveLength(3)
  })
})
