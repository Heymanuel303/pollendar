import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the api client's `get` so list() resolves with controlled data and no real fetch fires;
// the store itself runs for real against the active Pinia (so storeToRefs wiring is exercised).
const { get } = vi.hoisted(() => ({
  get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, get }
})

import Dashboard from '../Dashboard.vue'
import PollCard from '@/components/PollCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { Poll } from '@/stores/pollStore'

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: '1',
    userId: '1',
    publicToken: 'tok',
    title: 'Team dinner',
    description: null,
    timezone: 'Europe/Brussels',
    status: 'open',
    finalSlotId: null,
    closesAt: null,
    completedAt: null,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    ...overrides,
  }
}

function mountDashboard() {
  return mount(Dashboard, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('Dashboard', () => {
  it('calls GET /polls exactly once on mount', async () => {
    get.mockResolvedValue([])
    mountDashboard()
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/polls')
  })

  it('shows the EmptyState (and no PollCard grid) when the creator has no polls', async () => {
    get.mockResolvedValue([])
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)
    expect(wrapper.findAllComponents(PollCard)).toHaveLength(0)
    expect(wrapper.text()).toContain('New polls show up here')
    // Plain, direct empty-state body (no "gather"/metaphor wording).
    expect(wrapper.text()).toContain(
      "Create one to collect everyone's availability. Takes about a minute.",
    )
  })

  it('renders the plain subheading and a "Loading your polls…" line while the cold load is in flight', async () => {
    // Leave the GET pending so `loading` stays true and the loading branch (not empty/grid) renders.
    get.mockReturnValue(new Promise(() => {}))
    const wrapper = mountDashboard()
    await nextTick() // let onMounted's list() flip `loading` and Vue flush the re-render

    expect(wrapper.text()).toContain(
      'Find a time everyone can make. See all your polls in one place.',
    )
    expect(wrapper.text()).toContain('Loading your polls…')
    // Old "gathering" voice is gone.
    expect(wrapper.text()).not.toContain('Gathering your polls')
  })

  it('renders one PollCard per returned poll, newest-first (no re-sort), when polls exist', async () => {
    get.mockResolvedValue([
      makePoll({ id: '2', title: 'Team dinner' }),
      makePoll({ id: '1', title: 'Book club', status: 'completed' }),
    ])
    const wrapper = mountDashboard()
    await flushPromises()

    const cards = wrapper.findAllComponents(PollCard)
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('Team dinner')
    expect(cards[1]?.text()).toContain('Book club')
    expect(wrapper.findComponent(EmptyState).exists()).toBe(false)
  })
})
