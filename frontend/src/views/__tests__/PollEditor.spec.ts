import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Stub the router so `useRouter()` (and the post-create/save `router.push`) is inert in jsdom, and
// `useRoute()` returns mutable params so each test picks CREATE (`{}`) vs EDIT (`{ id }`) before mount.
const push = vi.fn<(to: string) => Promise<void>>()
const routeState: { params: Record<string, string> } = { params: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: routeState.params }),
}))

import PollEditor from '../PollEditor.vue'
import CalendarDateEditor from '@/components/CalendarDateEditor.vue'
import DateSlotEditor from '@/components/DateSlotEditor.vue'
import DateCard from '@/components/DateCard.vue'
import SlotRow from '@/components/SlotRow.vue'
import { usePollStore } from '@/stores/pollStore'
import type { Poll as OwnedPoll } from '@/lib/api/types'
import type { PollDateInput } from '@/types/poll'

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
  // Default to CREATE mode (`/polls/new`) — edit tests opt in by setting `routeState.params.id`.
  routeState.params = {}
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
      {
        eventDate: '2026-07-01',
        slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }],
      },
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
    expect(wrapper.get('aside').classes()).toEqual(expect.arrayContaining(['hidden', 'lg:block']))
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

describe('PollEditor — edit mode', () => {
  /**
   * Owned poll fixture: a VOTED date `D1` (slot `S1`, 3 responses ⇒ locked) and a ZERO-VOTE date `D2`
   * (slot `S2`, 0 responses ⇒ freely editable). Wire times are `1970-01-01T…Z` ISO instants; the
   * editor hydrates them to `"HH:mm"`. `closesAt` is an ISO instant to exercise the round-trip.
   */
  function makeOwnedPoll(overrides: Partial<OwnedPoll> = {}): OwnedPoll {
    return {
      id: 'EDIT_ID',
      title: 'Team dinner',
      description: 'Pick a night',
      timezone: 'Europe/Brussels',
      status: 'open',
      publicToken: 'tok-abc',
      closesAt: '2026-06-25T18:00:00.000Z',
      finalSlotId: null,
      completedAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      dates: [
        {
          id: 'D1',
          eventDate: '2026-06-26T00:00:00.000Z',
          sortOrder: 0,
          invalidatedAt: null,
          slots: [
            {
              id: 'S1',
              startTime: '1970-01-01T18:00:00.000Z',
              endTime: '1970-01-01T20:00:00.000Z',
              isAllDay: false,
              label: 'Dinner',
              sortOrder: 0,
              invalidatedAt: null,
              _count: { responses: 3 },
            },
          ],
        },
        {
          id: 'D2',
          eventDate: '2026-06-27T00:00:00.000Z',
          sortOrder: 1,
          invalidatedAt: null,
          slots: [
            {
              id: 'S2',
              startTime: '1970-01-01T12:00:00.000Z',
              endTime: '1970-01-01T13:00:00.000Z',
              isAllDay: false,
              label: 'Lunch',
              sortOrder: 0,
              invalidatedAt: null,
              _count: { responses: 0 },
            },
          ],
        },
      ],
      ...overrides,
    }
  }

  /** Mount in edit mode with `pollStore.get`/`update` stubbed to swap in `poll`. Defaults to desktop (List editor). */
  async function mountEditMode(poll: OwnedPoll = makeOwnedPoll()) {
    routeState.params = { id: 'EDIT_ID' }
    const store = usePollStore()
    const getSpy = vi.spyOn(store, 'get').mockImplementation(async () => {
      store.currentPoll = poll
    })
    const updateSpy = vi.spyOn(store, 'update').mockImplementation(async () => {
      store.currentPoll = poll
    })
    const createSpy = vi.spyOn(store, 'create').mockResolvedValue({
      id: 'EDIT_ID',
      publicToken: 'tok-abc',
      shareUrl: 'https://x/p/tok-abc',
      title: 'Team dinner',
      status: 'open',
    })
    const wrapper = mountEditor()
    await flushPromises()
    return { wrapper, store, getSpy, updateSpy, createSpy }
  }

  /** Current form `dates` as seen by the active List editor (the source of every payload). */
  function editorDates(wrapper: ReturnType<typeof mountEditor>): PollDateInput[] {
    return wrapper.findComponent(DateSlotEditor).props('modelValue') as PollDateInput[]
  }

  function buttonByText(wrapper: ReturnType<typeof mountEditor>, text: string) {
    return wrapper.findAll('button').find((b) => b.text() === text)
  }

  it('loads the owned poll via pollStore.get and pre-populates the form', async () => {
    const { wrapper, getSpy } = await mountEditMode()

    expect(getSpy).toHaveBeenCalledWith('EDIT_ID')
    // Heading + breadcrumb + action button switch to edit copy.
    expect(wrapper.get('h1').text()).toBe('Edit poll')
    expect(buttonByText(wrapper, 'Save changes')).toBeTruthy()
    expect(buttonByText(wrapper, 'Create poll')).toBeFalsy()
    // Title/description hydrated (reflected in the preview), timezone threaded to the editor.
    expect(wrapper.get('aside h3').text()).toBe('Team dinner')
    expect(wrapper.findComponent(DateSlotEditor).props('timezone')).toBe('Europe/Brussels')

    const dates = editorDates(wrapper)
    expect(dates).toHaveLength(2)
    expect(dates[0]!.id).toBe('D1')
    expect(dates[0]!.eventDate).toBe('2026-06-26') // ISO instant sliced to bare YYYY-MM-DD
    expect(dates[0]!.slots[0]).toMatchObject({
      id: 'S1',
      startTime: '18:00',
      endTime: '20:00',
      hasVotes: true,
    })
    expect(dates[1]!.slots[0]).toMatchObject({ id: 'S2', hasVotes: false })
  })

  it('locks the voted slot read-only (invalidate control, no inputs) but keeps the zero-vote slot editable', async () => {
    const { wrapper } = await mountEditMode()
    const slotRows = wrapper.findAllComponents(SlotRow)
    expect(slotRows).toHaveLength(2)

    // S1 (voted) is locked: read-only, an Invalidate control, and no time inputs / remove ✕.
    expect(slotRows[0]!.props('locked')).toBe(true)
    expect(slotRows[0]!.find('input[aria-label="Start time"]').exists()).toBe(false)
    expect(slotRows[0]!.findAll('button').some((b) => b.text() === 'Invalidate')).toBe(true)

    // S2 (zero-vote) stays freely editable: locked=false and its time inputs are present.
    expect(slotRows[1]!.props('locked')).toBe(false)
    expect(slotRows[1]!.find('input[aria-label="Start time"]').exists()).toBe(true)
  })

  it('invalidating the voted slot stamps its invalidatedAt', async () => {
    const { wrapper } = await mountEditMode()
    const invalidate = wrapper
      .findAllComponents(SlotRow)[0]!
      .findAll('button')
      .find((b) => b.text() === 'Invalidate')!
    await invalidate.trigger('click')

    expect(editorDates(wrapper)[0]!.slots[0]!.invalidatedAt).not.toBeNull()
    expect(typeof editorDates(wrapper)[0]!.slots[0]!.invalidatedAt).toBe('string')
  })

  it('invalidating a voted date stamps invalidatedAt on the date AND each of its slots', async () => {
    const { wrapper } = await mountEditMode()
    const dateInvalidate = wrapper
      .findAllComponents(DateCard)[0]!
      .findAll('button')
      .find((b) => b.text() === 'Invalidate date')!
    await dateInvalidate.trigger('click')

    const d1 = editorDates(wrapper)[0]!
    expect(d1.invalidatedAt).not.toBeNull()
    expect(d1.slots.every((s) => s.invalidatedAt != null)).toBe(true)
  })

  it('allows adding a brand-new date (no id) in edit mode', async () => {
    const { wrapper } = await mountEditMode()
    const addDate =
      buttonByText(wrapper, '+ Add date') ??
      wrapper.findAll('button').find((b) => b.text().includes('Add date'))!
    await addDate.trigger('click')

    const dates = editorDates(wrapper)
    expect(dates).toHaveLength(3)
    expect(dates[2]!.id).toBeUndefined()
  })

  it('submits via pollStore.update (PATCH) — ids + invalidatedAt + closesAt round-trip, new rows omit id', async () => {
    const { wrapper, updateSpy, createSpy } = await mountEditMode()

    // Invalidate the voted slot so its marker must round-trip in the payload.
    await wrapper
      .findAllComponents(SlotRow)[0]!
      .findAll('button')
      .find((b) => b.text() === 'Invalidate')!
      .trigger('click')
    // Add a brand-new date so the payload carries an id-less row.
    await (
      buttonByText(wrapper, '+ Add date') ??
      wrapper.findAll('button').find((b) => b.text().includes('Add date'))!
    ).trigger('click')

    await buttonByText(wrapper, 'Save changes')!.trigger('click')
    await flushPromises()

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [id, payload] = updateSpy.mock.calls[0]!
    expect(id).toBe('EDIT_ID')
    expect(payload.title).toBe('Team dinner')
    expect(payload.closesAt).toBe('2026-06-25T18:00:00.000Z') // ISO round-trip
    // Existing date/slot carry their ids + the invalidatedAt marker.
    const sentDates = payload.dates!
    expect(sentDates[0]).toMatchObject({ id: 'D1' })
    expect(sentDates[0]!.slots[0]!.id).toBe('S1')
    expect(sentDates[0]!.slots[0]!.invalidatedAt).not.toBeNull()
    // The brand-new date (last) omits its id.
    expect(sentDates[sentDates.length - 1]!.id).toBeUndefined()
  })

  it('blocks saving when every active date/slot is invalidated and does not call update', async () => {
    // Single voted date: invalidating its only slot leaves zero active entries.
    const poll = makeOwnedPoll({
      dates: [
        {
          id: 'D1',
          eventDate: '2026-06-26T00:00:00.000Z',
          sortOrder: 0,
          invalidatedAt: null,
          slots: [
            {
              id: 'S1',
              startTime: '1970-01-01T18:00:00.000Z',
              endTime: '1970-01-01T20:00:00.000Z',
              isAllDay: false,
              label: 'Dinner',
              sortOrder: 0,
              invalidatedAt: null,
              _count: { responses: 2 },
            },
          ],
        },
      ],
    })
    const { wrapper, updateSpy } = await mountEditMode(poll)

    await wrapper
      .findAllComponents(SlotRow)[0]!
      .findAll('button')
      .find((b) => b.text() === 'Invalidate')!
      .trigger('click')
    await buttonByText(wrapper, 'Save changes')!.trigger('click')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Keep at least one active date')
  })
})
