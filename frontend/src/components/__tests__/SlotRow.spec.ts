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

const TIMED: PollSlotInput = {
  isAllDay: false,
  startTime: '18:00',
  endTime: '20:00',
  label: 'Early',
}
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

  // Phase 4 responsive pass: 44px touch targets via the `touch-target` utility across the toggle,
  // remove button and a min-width on the time inputs so they stay legible at 375px.
  it('gives the All-day / Set-times toggle a touch-target floor', () => {
    const wrapper = mountRow(TIMED)
    for (const label of ['All day', 'Set times']) {
      const btn = wrapper.findAll('button').find((b) => b.text() === label)!
      expect(btn.classes()).toEqual(expect.arrayContaining(['touch-target', 'px-3', 'py-2']))
    }
  })

  it('gives the remove button a touch-target floor', () => {
    const remove = mountRow(TIMED).get('button[aria-label="Remove slot"]')
    expect(remove.classes()).toContain('touch-target')
  })

  it('keeps the time inputs legible with a min-width and vertical padding', () => {
    const start = mountRow(TIMED).get('input[aria-label="Start time"]')
    expect(start.classes()).toContain('py-2.5')
    expect(start.classes()).toContain('min-w-[5.5rem]')
  })
})

/**
 * Edit-mode `locked` slot (a voted or invalidated row): the inputs collapse to a read-only label +
 * time range, the remove ✕ is hidden, and only an Invalidate / Reactivate control remains.
 */
describe('SlotRow, locked (edit mode)', () => {
  const LOCKED: PollSlotInput = {
    id: 'S1',
    isAllDay: false,
    startTime: '18:00',
    endTime: '20:00',
    label: 'Dinner',
    hasVotes: true,
    invalidatedAt: null,
  }

  function mountLocked(modelValue: PollSlotInput = LOCKED) {
    return mount(SlotRow, { props: { modelValue, locked: true } })
  }

  it('renders read-only label + time range with no inputs and no remove ✕', () => {
    const wrapper = mountLocked()
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.find('button[aria-label="Remove slot"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Dinner')
    expect(wrapper.text()).toContain('18:00–20:00')
  })

  it('renders "All day" read-only for a locked all-day slot', () => {
    const wrapper = mountLocked({ id: 'S9', isAllDay: true, hasVotes: true, invalidatedAt: null })
    expect(wrapper.text()).toContain('All day')
  })

  it('exposes an Invalidate control that stamps invalidatedAt on click', async () => {
    const wrapper = mountLocked()
    const invalidate = wrapper.findAll('button').find((b) => b.text() === 'Invalidate')!
    expect(invalidate).toBeTruthy()

    await invalidate.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollSlotInput
    expect(emitted.invalidatedAt).not.toBeNull()
    expect(typeof emitted.invalidatedAt).toBe('string')
  })

  it('shows a Reactivate control + "Invalidated" badge for an already-invalidated slot and clears it on click', async () => {
    const wrapper = mountLocked({ ...LOCKED, invalidatedAt: '2026-06-19T10:00:00.000Z' })
    expect(wrapper.text()).toContain('Invalidated')
    const reactivate = wrapper.findAll('button').find((b) => b.text() === 'Reactivate')!
    expect(reactivate).toBeTruthy()

    await reactivate.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')![0]![0] as PollSlotInput
    expect(emitted.invalidatedAt).toBeNull()
  })

  it('never shows the incomplete-times validation visual when locked', () => {
    const incomplete: PollSlotInput = {
      id: 'S2',
      isAllDay: false,
      startTime: '18:00',
      hasVotes: true,
    }
    const wrapper = mount(SlotRow, {
      props: { modelValue: incomplete, locked: true, showErrors: true },
    })
    expect(wrapper.text()).not.toContain('Set a start and end time')
  })
})
