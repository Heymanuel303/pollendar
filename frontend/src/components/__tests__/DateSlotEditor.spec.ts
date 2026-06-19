import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DateSlotEditor from '../DateSlotEditor.vue'
import type { PollDateInput, PollSlotInput } from '@/types/poll'

type Wrapper = ReturnType<typeof mount>

function timeSlot(overrides: Partial<PollSlotInput> = {}): PollSlotInput {
  return { startTime: '18:00', endTime: '20:00', isAllDay: false, ...overrides }
}

function oneDate(): PollDateInput[] {
  return [{ eventDate: '2026-06-26', slots: [timeSlot()] }]
}

function twoDates(): PollDateInput[] {
  return [
    { eventDate: '2026-06-26', slots: [timeSlot()] },
    { eventDate: '2026-06-27', slots: [timeSlot()] },
  ]
}

function mountEditor(modelValue: PollDateInput[]): Wrapper {
  return mount(DateSlotEditor, { props: { modelValue, timezone: 'Europe/Brussels' } })
}

/** Newest `update:modelValue` payload — the immutable array the editor would hand its parent. */
function lastModel(wrapper: Wrapper): PollDateInput[] {
  const events = wrapper.emitted('update:modelValue') as unknown[][] | undefined
  expect(events, 'expected an update:modelValue emit').toBeTruthy()
  const calls = events ?? []
  const latest = calls[calls.length - 1] ?? []
  return latest[0] as PollDateInput[]
}

/** First button whose rendered text contains `text` (throws if none, so tests fail loudly). */
function buttonByText(wrapper: Wrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))
  if (!button) throw new Error(`No button containing "${text}"`)
  return button
}

describe('DateSlotEditor', () => {
  it('"+ Add slot" grows the date\'s slots and the badge reflects the new totals', async () => {
    const wrapper = mountEditor(oneDate())

    await buttonByText(wrapper, 'Add slot').trigger('click')

    const model = lastModel(wrapper)
    expect(model[0]?.slots).toHaveLength(2)

    // The editor is controlled — re-feed the emitted value to see the badge recompute.
    await wrapper.setProps({ modelValue: model })
    expect(wrapper.text()).toContain('1 date')
    expect(wrapper.text()).toContain('2 slots')
  })

  it('removing the last slot emits the date with an empty slot list', async () => {
    const wrapper = mountEditor(oneDate())

    await wrapper.get('[aria-label="Remove slot"]').trigger('click')

    const model = lastModel(wrapper)
    expect(model).toHaveLength(1)
    expect(model[0]?.slots).toHaveLength(0)
  })

  it('removing a date emits the reduced array', async () => {
    const wrapper = mountEditor(twoDates())

    await wrapper.get('[aria-label="Remove date"]').trigger('click')

    const model = lastModel(wrapper)
    expect(model).toHaveLength(1)
    expect(model[0]?.eventDate).toBe('2026-06-27')
  })

  it('toggling a slot to all-day hides the time inputs and emits isAllDay with no times', async () => {
    const wrapper = mountEditor(oneDate())
    expect(wrapper.findAll('input[type="time"]')).toHaveLength(2)

    await buttonByText(wrapper, 'All day').trigger('click')

    const slot = lastModel(wrapper)[0]?.slots[0]
    expect(slot?.isAllDay).toBe(true)
    expect(slot?.startTime).toBeUndefined()
    expect(slot?.endTime).toBeUndefined()

    await wrapper.setProps({ modelValue: lastModel(wrapper) })
    expect(wrapper.findAll('input[type="time"]')).toHaveLength(0)
  })
})
