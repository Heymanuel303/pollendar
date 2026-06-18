import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotRow from '../SlotRow.vue'
import type { PollSlotInput } from '@/types/poll'

/**
 * SlotRow is the editor's per-slot control: a label, an All-day / Set-times
 * segmented toggle, and start/end time inputs. Phase 3's responsive pass bumped
 * the toggle, remove button and time/label inputs to a 44px touch target. These
 * tests pin the all-day toggle behaviour AND those touch-target classes.
 */
function mountRow(modelValue: PollSlotInput, showErrors = false) {
  return mount(SlotRow, { props: { modelValue, showErrors } })
}

const TIMED: PollSlotInput = { isAllDay: false, startTime: '18:00', endTime: '20:00', label: 'Early' }
const ALL_DAY: PollSlotInput = { isAllDay: true, label: 'Any time' }

describe('SlotRow', () => {
  it('shows the time inputs only in set-times mode', () => {
    expect(mountRow(TIMED).findAll('input[type="time"]')).toHaveLength(2)
    expect(mountRow(ALL_DAY).findAll('input[type="time"]')).toHaveLength(0)
  })

  it('drops the times when switching to all-day', async () => {
    const wrapper = mountRow(TIMED)
    const allDayBtn = wrapper.findAll('button').find((b) => b.text() === 'All day')!

    await allDayBtn.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollSlotInput
    expect(emitted.isAllDay).toBe(true)
    expect(emitted.startTime).toBeUndefined()
    expect(emitted.endTime).toBeUndefined()
  })

  it('seeds a default range when switching back to set-times', async () => {
    const wrapper = mountRow(ALL_DAY)
    const setTimesBtn = wrapper.findAll('button').find((b) => b.text() === 'Set times')!

    await setTimesBtn.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollSlotInput
    expect(emitted.isAllDay).toBe(false)
    expect(emitted.startTime).toBe('18:00')
    expect(emitted.endTime).toBe('20:00')
  })

  it('emits remove when the ✕ button is clicked', async () => {
    const wrapper = mountRow(TIMED)
    await wrapper.get('button[aria-label="Remove slot"]').trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('reveals the validation message for an incomplete timed slot once showErrors is set', () => {
    const incomplete: PollSlotInput = { isAllDay: false, startTime: '18:00' }
    expect(mountRow(incomplete, true).text()).toContain('Set a start and end time')
    // Hidden until the editor flags errors.
    expect(mountRow(incomplete, false).text()).not.toContain('Set a start and end time')
  })

  // Phase 3 responsive pass: 44px touch targets across the toggle, remove button and time inputs.
  it('gives the All-day / Set-times toggle a 44px floor', () => {
    const wrapper = mountRow(TIMED)
    for (const label of ['All day', 'Set times']) {
      const btn = wrapper.findAll('button').find((b) => b.text() === label)!
      expect(btn.classes()).toEqual(expect.arrayContaining(['min-h-11', 'px-3', 'py-2']))
    }
  })

  it('gives the remove button a 44px floor', () => {
    const remove = mountRow(TIMED).get('button[aria-label="Remove slot"]')
    expect(remove.classes()).toEqual(expect.arrayContaining(['min-h-11', 'px-3', 'py-2']))
  })

  it('pads the time inputs to clear 44px', () => {
    const start = mountRow(TIMED).get('input[aria-label="Start time"]')
    expect(start.classes()).toContain('py-2.5')
  })
})
