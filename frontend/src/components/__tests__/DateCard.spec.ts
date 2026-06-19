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
