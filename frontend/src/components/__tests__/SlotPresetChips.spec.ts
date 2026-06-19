import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotPresetChips from '../SlotPresetChips.vue'
import type { PollSlotInput } from '@/types/poll'

type Wrapper = ReturnType<typeof mount>

function mountChips(modelValue: PollSlotInput[] = []): Wrapper {
  return mount(SlotPresetChips, { props: { modelValue } })
}

/** Newest `update:modelValue` payload, the immutable array the picker hands its parent. */
function lastModel(wrapper: Wrapper): PollSlotInput[] {
  const events = wrapper.emitted('update:modelValue') as unknown[][] | undefined
  expect(events, 'expected an update:modelValue emit').toBeTruthy()
  const calls = events ?? []
  const latest = calls[calls.length - 1] ?? []
  return latest[0] as PollSlotInput[]
}

/** First button whose rendered text contains `text` (throws if none, so tests fail loudly). */
function buttonByText(wrapper: Wrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))
  if (!button) throw new Error(`No button containing "${text}"`)
  return button
}

describe('SlotPresetChips', () => {
  it('clicking "Morning" emits a single 09:00–12:00 time slot', async () => {
    const wrapper = mountChips([])

    await buttonByText(wrapper, 'Morning').trigger('click')

    expect(lastModel(wrapper)).toEqual([
      { isAllDay: false, startTime: '09:00', endTime: '12:00', label: 'Morning' },
    ])
  })

  it('re-feeding the Morning model and clicking "Morning" again toggles it off', async () => {
    const wrapper = mountChips([])

    await buttonByText(wrapper, 'Morning').trigger('click')
    await wrapper.setProps({ modelValue: lastModel(wrapper) })
    await buttonByText(wrapper, 'Morning').trigger('click')

    expect(lastModel(wrapper)).toEqual([])
  })

  it('clicking "All day" emits an all-day slot with no times', async () => {
    const wrapper = mountChips([])

    await buttonByText(wrapper, 'All day').trigger('click')

    expect(lastModel(wrapper)).toEqual([{ isAllDay: true, label: 'All day' }])
  })

  it('the custom row emits a { startTime, endTime, isAllDay: false } slot on Add', async () => {
    const wrapper = mountChips([])

    await wrapper.get('input[aria-label="Custom start time"]').setValue('07:30')
    await wrapper.get('input[aria-label="Custom end time"]').setValue('08:45')
    await buttonByText(wrapper, 'Add').trigger('click')

    expect(lastModel(wrapper)).toEqual([
      { isAllDay: false, startTime: '07:30', endTime: '08:45', label: 'Custom' },
    ])
  })

  it('Add with a half-filled custom range does not emit', async () => {
    const wrapper = mountChips([])

    await wrapper.get('input[aria-label="Custom start time"]').setValue('07:30')
    await buttonByText(wrapper, 'Add').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
