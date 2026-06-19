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

/**
 * jsdom omits `window.matchMedia`, which the calendar's `useBreakpoint` reads at setup (for day-grid
 * density only). Stub it so mounting the editor — which renders `CalendarDateEditor` — never throws.
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

describe('PollEditor — split layout', () => {
  it('renders no Calendar | List toggle', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('[role="group"][aria-label="Editor view"]').exists()).toBe(false)
  })

  it('renders BOTH editors at once, bound to the same dates ref', () => {
    const wrapper = mountEditor()
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(true)
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(true)
    // Same shared ref ⇒ same length, no payload divergence.
    const calendarDates = wrapper.findComponent(CalendarDateEditor).props('modelValue')
    const listDates = wrapper.findComponent(DateSlotEditor).props('modelValue')
    expect(listDates).toBe(calendarDates)
  })

  it('passes the identical prop trio (timezone + show-errors) to both editors', () => {
    const wrapper = mountEditor()
    for (const editor of [
      wrapper.findComponent(CalendarDateEditor),
      wrapper.findComponent(DateSlotEditor),
    ]) {
      expect(typeof editor.props('timezone')).toBe('string')
      expect(editor.props('showErrors')).toBe(false)
    }
  })

  it('anchors a type=button Create poll action and renders no preview surfaces', async () => {
    const wrapper = mountEditor()

    const createBtn = wrapper.findAll('button').find((b) => b.text() === 'Create poll')
    expect(createBtn, 'expected a Create poll action').toBeTruthy()
    expect(createBtn!.attributes('type')).toBe('button')

    // No preview sidebar and no teleported bottom-sheet, even after tapping a day.
    expect(wrapper.find('aside').exists()).toBe(false)
    const dayCell = wrapper
      .findAll('button')
      .find((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.attributes('aria-label') ?? ''))
    await dayCell!.trigger('click')
    expect(document.body.querySelector('[role="dialog"][aria-label="Poll preview"]')).toBeNull()
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

  /**
   * Mount in edit mode with `pollStore.loadDetail`/`update` stubbed to swap in `poll`. The editor's
   * `onMounted` calls the cold-load orchestrator `loadDetail` (not the bare `get`), so the spy lands
   * on `loadDetail` — it hydrates `currentPoll` exactly as the real orchestrator would after its GET.
   */
  async function mountEditMode(poll: OwnedPoll = makeOwnedPoll()) {
    routeState.params = { id: 'EDIT_ID' }
    const store = usePollStore()
    const loadDetailSpy = vi.spyOn(store, 'loadDetail').mockImplementation(async () => {
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
    return { wrapper, store, loadDetailSpy, updateSpy, createSpy }
  }

  /** Current form `dates` as seen by the active List editor (the source of every payload). */
  function editorDates(wrapper: ReturnType<typeof mountEditor>): PollDateInput[] {
    return wrapper.findComponent(DateSlotEditor).props('modelValue') as PollDateInput[]
  }

  function buttonByText(wrapper: ReturnType<typeof mountEditor>, text: string) {
    return wrapper.findAll('button').find((b) => b.text() === text)
  }

  /**
   * Add a brand-new candidate date by tapping its day cell in the Calendar editor — the "+ Add date"
   * button was removed in favour of the tap-to-select calendar (commit 65b0d61). The cell is the
   * `<button aria-label="YYYY-MM-DD">` rendered by {@link CalendarDateEditor}.
   */
  async function tapDay(wrapper: ReturnType<typeof mountEditor>, iso: string) {
    const cell = wrapper.findAll('button').find((b) => b.attributes('aria-label') === iso)
    if (!cell) throw new Error(`No calendar day cell for "${iso}"`)
    await cell.trigger('click')
  }

  it('loads the owned poll via pollStore.loadDetail and pre-populates the form', async () => {
    const { wrapper, loadDetailSpy } = await mountEditMode()

    expect(loadDetailSpy).toHaveBeenCalledWith('EDIT_ID')
    // Heading + breadcrumb + action button switch to edit copy.
    expect(wrapper.get('h1').text()).toBe('Edit poll')
    expect(buttonByText(wrapper, 'Save changes')).toBeTruthy()
    expect(buttonByText(wrapper, 'Create poll')).toBeFalsy()
    // Title hydrated onto the form input; timezone threaded to the editor.
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Team dinner')
    expect(wrapper.findComponent(DateSlotEditor).props('timezone')).toBe('Europe/Brussels')
    // Both editors render at once (no toggle), bound to the same dates ref.
    expect(wrapper.findComponent(CalendarDateEditor).exists()).toBe(true)
    expect(wrapper.findComponent(DateSlotEditor).exists()).toBe(true)

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
    // Tap an unselected day (fixture has 2026-06-26 + 2026-06-27) to add a brand-new candidate date.
    await tapDay(wrapper, '2026-06-28')

    const dates = editorDates(wrapper)
    expect(dates).toHaveLength(3)
    // The brand-new date is sorted in by eventDate and carries no id.
    const added = dates.find((d) => d.eventDate.slice(0, 10) === '2026-06-28')!
    expect(added.id).toBeUndefined()
  })

  it('submits via pollStore.update (PATCH) — ids + invalidatedAt + closesAt round-trip, new rows omit id', async () => {
    const { wrapper, updateSpy, createSpy } = await mountEditMode()

    // Invalidate the voted slot so its marker must round-trip in the payload.
    await wrapper
      .findAllComponents(SlotRow)[0]!
      .findAll('button')
      .find((b) => b.text() === 'Invalidate')!
      .trigger('click')
    // Add a brand-new date (tap an unselected day) so the payload carries an id-less row.
    await tapDay(wrapper, '2026-06-28')

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
