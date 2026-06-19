import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarDateEditor from '../CalendarDateEditor.vue'
import type { PollDateInput, PollSlotInput } from '@/types/poll'

type Wrapper = ReturnType<typeof mount>

/**
 * jsdom omits `window.matchMedia`, which `useBreakpoint` reads at setup. Stub it as always-unmatched
 * (phone tier) — this component uses `isPhone` for layout density only, so the breakpoint never
 * affects selection logic or the emitted payload.
 */
beforeEach(() => {
  const matchMedia = vi.fn<(query: string) => MediaQueryList>(
    (query: string) =>
      ({
        matches: false,
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
})

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
  return mount(CalendarDateEditor, { props: { modelValue, timezone: 'Europe/Brussels' } })
}

/** Newest `update:modelValue` payload — the immutable array the editor would hand its parent. */
function lastModel(wrapper: Wrapper): PollDateInput[] {
  const events = wrapper.emitted('update:modelValue') as unknown[][] | undefined
  expect(events, 'expected an update:modelValue emit').toBeTruthy()
  const calls = events ?? []
  const latest = calls[calls.length - 1] ?? []
  return latest[0] as PollDateInput[]
}

/** The day-cell button for a bare `"YYYY-MM-DD"` (matched on its aria-label). */
function dayCell(wrapper: Wrapper, iso: string) {
  return wrapper.get(`button[aria-label="${iso}"]`)
}

describe('CalendarDateEditor', () => {
  it('tapping an unselected day emits the array grown by one date with a single default slot', async () => {
    const wrapper = mountEditor(oneDate())

    await dayCell(wrapper, '2026-06-20').trigger('click')

    const model = lastModel(wrapper)
    expect(model).toHaveLength(2)
    const added = model.find((d) => d.eventDate === '2026-06-20')
    expect(added).toBeTruthy()
    // Bare 10-char date string, not a full ISO instant.
    expect(added?.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(added?.slots).toHaveLength(1)
    expect(added?.slots[0]?.isAllDay).toBe(false)
  })

  it('keeps newly-added dates sorted ascending by eventDate', async () => {
    const wrapper = mountEditor(oneDate())

    await dayCell(wrapper, '2026-06-10').trigger('click')

    const model = lastModel(wrapper)
    expect(model.map((d) => d.eventDate)).toEqual(['2026-06-10', '2026-06-26'])
  })

  it('tapping an already-selected day emits the array with that date removed', async () => {
    const wrapper = mountEditor(oneDate())

    await dayCell(wrapper, '2026-06-26').trigger('click')

    const model = lastModel(wrapper)
    expect(model).toHaveLength(0)
  })

  it('the "N selected" count reflects modelValue.length after setProps', async () => {
    const wrapper = mountEditor(oneDate())
    expect(wrapper.text()).toContain('1 selected')

    await wrapper.setProps({ modelValue: twoDates() })
    expect(wrapper.text()).toContain('2 selected')
  })

  it('renders no bulk-apply preset panel — the calendar is a pure day-picker', () => {
    const wrapper = mountEditor(twoDates())
    expect(wrapper.text()).not.toContain('Apply a time block')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Apply to'))).toBe(false)
  })

  it('renders the showErrors empty-state message matching the List flow', () => {
    const wrapper = mount(CalendarDateEditor, {
      props: { modelValue: [], timezone: 'Europe/Brussels', showErrors: true },
    })
    expect(wrapper.text()).toContain('Add at least one candidate date.')
  })

  it('no emitted date or slot carries a sortOrder, and no closesAt appears', async () => {
    const wrapper = mountEditor(oneDate())

    await dayCell(wrapper, '2026-06-20').trigger('click')

    for (const event of wrapper.emitted('update:modelValue') as unknown[][]) {
      const model = event[0] as PollDateInput[]
      for (const date of model) {
        expect(date).not.toHaveProperty('sortOrder')
        expect(date).not.toHaveProperty('closesAt')
        for (const slot of date.slots) {
          expect(slot).not.toHaveProperty('sortOrder')
          expect(slot).not.toHaveProperty('closesAt')
        }
      }
    }
  })
})
