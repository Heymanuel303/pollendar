import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Stub the router so `useRouter()` (and the post-create `router.push`) is inert in jsdom.
const push = vi.fn<(to: string) => Promise<void>>()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import PollEditor from '../PollEditor.vue'
import CalendarDateEditor from '@/components/CalendarDateEditor.vue'
import DateSlotEditor from '@/components/DateSlotEditor.vue'

const KEY = 'pollendar:editor-view'

/**
 * jsdom omits `window.matchMedia`, which `useBreakpoint` reads at setup. `matches` toggles the
 * phone vs desktop default; tests that care about the default set it explicitly via `stubMatchMedia`.
 */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn<(query: string) => MediaQueryList>(
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
    ),
    configurable: true,
    writable: true,
  })
}

function mountEditor() {
  return mount(PollEditor, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

/** Find the segmented-toggle button by its visible label. */
function toggleButton(wrapper: ReturnType<typeof mountEditor>, label: 'Calendar' | 'List') {
  const group = wrapper.get('[role="group"][aria-label="Editor view"]')
  const btn = group.findAll('button').find((b) => b.text() === label)
  expect(btn, `expected a "${label}" toggle button`).toBeTruthy()
  return btn!
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  // sm-and-up by default (desktop) unless a test overrides it.
  stubMatchMedia(true)
})

afterEach(() => {
  localStorage.clear()
})

describe('PollEditor — Calendar | List toggle', () => {
  it('renders a Calendar | List segmented toggle', () => {
    const wrapper = mountEditor()
    const group = wrapper.get('[role="group"][aria-label="Editor view"]')
    const labels = group.findAll('button').map((b) => b.text())
    expect(labels).toEqual(['Calendar', 'List'])
  })

  it('defaults to List on desktop when no preference is stored', () => {
    stubMatchMedia(true) // sm matches → not phone
    const wrapper = mountEditor()
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(true)
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(false)
    expect(toggleButton(wrapper, 'List').attributes('aria-pressed')).toBe('true')
  })

  it('defaults to Calendar on phone when no preference is stored', () => {
    stubMatchMedia(false) // sm does not match → isPhone
    const wrapper = mountEditor()
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(true)
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(false)
    expect(toggleButton(wrapper, 'Calendar').attributes('aria-pressed')).toBe('true')
  })

  it('honours a stored preference over the breakpoint default', () => {
    localStorage.setItem(KEY, 'calendar')
    stubMatchMedia(true) // desktop would default to List, but stored wins
    const wrapper = mountEditor()
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(true)
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(false)
  })

  it('swaps editors mutually exclusively and persists the choice on toggle', async () => {
    stubMatchMedia(true) // start on List
    const wrapper = mountEditor()
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(true)

    await toggleButton(wrapper, 'Calendar').trigger('click')
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(true)
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('calendar')

    await toggleButton(wrapper, 'List').trigger('click')
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(true)
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('list')
  })

  it('binds both editors to the SAME dates ref — toggling never drops a selection', async () => {
    stubMatchMedia(false) // start on Calendar
    const wrapper = mountEditor()

    const calendar = wrapper.findComponent(CalendarDateEditor)
    const before = calendar.props('modelValue')

    // Simulate the calendar emitting a new immutable dates array (an extra selected date).
    const extended = [
      ...before,
      { eventDate: '2026-07-01', slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }] },
    ]
    calendar.vm.$emit('update:modelValue', extended)
    await flushPromises()

    // Switch to List — the same dates must appear (shared ref, not a clone).
    await toggleButton(wrapper, 'List').trigger('click')
    const list = wrapper.findComponent(DateSlotEditor)
    expect(list.props('modelValue')).toHaveLength(extended.length)
    expect(list.props('modelValue').map((d: { eventDate: string }) => d.eventDate)).toContain(
      '2026-07-01',
    )
  })

  it('passes the identical prop trio (timezone + show-errors) to whichever editor is active', () => {
    stubMatchMedia(true)
    const wrapper = mountEditor()
    const list = wrapper.findComponent(DateSlotEditor)
    expect(typeof list.props('timezone')).toBe('string')
    expect(list.props('showErrors')).toBe(false)
  })
})
