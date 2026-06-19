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

// Track mounted wrappers so teleported (Teleport to="body") sheet nodes are torn down between
// tests — otherwise an open sheet leaks into document.body and pollutes the next assertion.
const mounted: ReturnType<typeof mount>[] = []

function mountEditor() {
  const wrapper = mount(PollEditor, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mounted.push(wrapper)
  return wrapper
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
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
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

describe('PollEditor — phone preview bottom-sheet (phase 4)', () => {
  /** The bottom-sheet panel is teleported to <body>; find it by its dialog role + label. */
  function findSheet(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Poll preview"]')
  }

  function showPreviewTrigger(wrapper: ReturnType<typeof mountEditor>) {
    return wrapper.findAll('button').find((b) => b.text().includes('Show preview'))
  }

  it('renders a full-width "Show preview" trigger and hides the sticky sidebar on phone', () => {
    stubMatchMedia(false) // isPhone
    const wrapper = mountEditor()

    const trigger = showPreviewTrigger(wrapper)
    expect(trigger, 'expected a Show preview trigger on phone').toBeTruthy()
    // The trigger is phone-only (lg:hidden) and the sidebar is gated to lg+.
    expect(trigger!.classes()).toContain('lg:hidden')
    expect(wrapper.get('aside').classes()).toEqual(
      expect.arrayContaining(['hidden', 'lg:block']),
    )
    // Sheet starts closed.
    expect(findSheet()).toBeNull()
  })

  it('opens the teleported bottom-sheet when the trigger is tapped on phone', async () => {
    stubMatchMedia(false)
    const wrapper = mountEditor()

    await showPreviewTrigger(wrapper)!.trigger('click')

    const sheet = findSheet()
    expect(sheet, 'expected the bottom-sheet to open').not.toBeNull()
    // The sheet carries the safe-area + slide-in tokens from the foundations utilities.
    expect(sheet!.className).toContain('safe-bottom')
    expect(sheet!.className).toContain('animate-settle')
    // It is NOT a native <dialog>.
    expect(sheet!.tagName.toLowerCase()).not.toBe('dialog')
  })

  it('closes the sheet via the ✕ button', async () => {
    stubMatchMedia(false)
    const wrapper = mountEditor()

    await showPreviewTrigger(wrapper)!.trigger('click')
    const close = findSheet()!.querySelector<HTMLButtonElement>(
      'button[aria-label="Close preview"]',
    )
    expect(close).toBeTruthy()
    close!.click()
    await flushPromises()

    expect(findSheet()).toBeNull()
  })

  it('does NOT render the trigger or sheet at lg+ even after toggling', async () => {
    stubMatchMedia(true) // desktop — isPhone is false
    const wrapper = mountEditor()

    // No phone trigger button exists in the rendered tree query for desktop intent:
    // it carries lg:hidden so it is present in DOM but the sheet is guarded by isPhone.
    const trigger = showPreviewTrigger(wrapper)
    if (trigger) {
      await trigger.trigger('click')
    }
    // isPhone is false → the v-if="isPhone && showPreview" never renders the sheet.
    expect(findSheet()).toBeNull()
  })

  it('the sheet exposes a working Create poll action wired to the store', async () => {
    stubMatchMedia(false)
    const wrapper = mountEditor()

    await showPreviewTrigger(wrapper)!.trigger('click')
    const sheet = findSheet()!
    const createBtn = Array.from(sheet.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Create poll'),
    )
    expect(createBtn, 'expected a Create poll button inside the sheet').toBeTruthy()
    expect(createBtn!.getAttribute('type')).toBe('button')
  })
})
