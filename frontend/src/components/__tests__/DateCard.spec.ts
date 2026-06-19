import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DateCard from '../DateCard.vue'
import type { PollDateInput } from '@/types/poll'

/**
 * DateCard is the editor's per-date control: a day chip, the slot rows, and the
 * remove-date / add-slot actions. Phase 4's responsive pass bumped those two
 * action buttons to a 44px touch target via the `touch-target` utility without
 * touching the emitted payload (verified by the add-slot default below).
 */
const DATE: PollDateInput = {
  eventDate: '2026-07-01',
  slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }],
}

function mountCard(modelValue: PollDateInput = DATE) {
  return mount(DateCard, { props: { modelValue, timezone: 'UTC' } })
}

describe('DateCard', () => {
  it('emits remove when the ✕ button is clicked', async () => {
    const wrapper = mountCard()
    await wrapper.get('button[aria-label="Remove date"]').trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('appends a default slot (unchanged payload shape) when "+ Add slot" is clicked', async () => {
    const wrapper = mountCard()
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add slot'))!
    await addBtn.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollDateInput
    expect(emitted.slots).toHaveLength(2)
    // The seeded default must stay byte-identical for the payload guarantee.
    expect(emitted.slots[1]).toEqual({ startTime: '18:00', endTime: '20:00', isAllDay: false })
  })

  // Phase 4 responsive pass: 44px touch targets via the `touch-target` utility.
  it('gives the Remove date button a touch-target floor', () => {
    const remove = mountCard().get('button[aria-label="Remove date"]')
    expect(remove.classes()).toContain('touch-target')
  })

  it('gives the "+ Add slot" button a touch-target floor', () => {
    const wrapper = mountCard()
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add slot'))!
    expect(addBtn.classes()).toContain('touch-target')
  })
})

/**
 * Edit-mode locking: a loaded date carrying votes (id + a `hasVotes` slot) becomes invalidate-only —
 * no add-slot, no remove-date — and surfaces an Invalidate-date control that deactivates the date AND
 * all its slots. A zero-vote loaded date in edit mode keeps full editability.
 */
describe('DateCard — edit mode locking', () => {
  const VOTED: PollDateInput = {
    id: 'D1',
    eventDate: '2026-07-01',
    invalidatedAt: null,
    hasVotes: true,
    slots: [
      {
        id: 'S1',
        startTime: '18:00',
        endTime: '20:00',
        isAllDay: false,
        hasVotes: true,
        invalidatedAt: null,
      },
    ],
  }
  const ZERO_VOTE: PollDateInput = {
    id: 'D2',
    eventDate: '2026-07-02',
    invalidatedAt: null,
    hasVotes: false,
    slots: [
      {
        id: 'S2',
        startTime: '12:00',
        endTime: '13:00',
        isAllDay: false,
        hasVotes: false,
        invalidatedAt: null,
      },
    ],
  }

  function mountEdit(modelValue: PollDateInput) {
    return mount(DateCard, { props: { modelValue, timezone: 'UTC', editMode: true } })
  }

  it('hides add-slot and remove-date on a voted date, exposing an Invalidate-date control', () => {
    const wrapper = mountEdit(VOTED)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Add slot'))).toBe(false)
    expect(wrapper.find('button[aria-label="Remove date"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Invalidate date')).toBe(true)
  })

  it('invalidating the date stamps invalidatedAt on the date AND every slot', async () => {
    const wrapper = mountEdit(VOTED)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Invalidate date')!
      .trigger('click')

    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollDateInput
    expect(emitted.invalidatedAt).not.toBeNull()
    expect(emitted.slots.every((s) => s.invalidatedAt != null)).toBe(true)
  })

  it('keeps a zero-vote date fully editable in edit mode (add-slot, remove-date, editable slot)', () => {
    const wrapper = mountEdit(ZERO_VOTE)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Add slot'))).toBe(true)
    expect(wrapper.find('button[aria-label="Remove date"]').exists()).toBe(true)
    // Its slot is unlocked → time inputs are present.
    expect(wrapper.find('input[aria-label="Start time"]').exists()).toBe(true)
  })
})
