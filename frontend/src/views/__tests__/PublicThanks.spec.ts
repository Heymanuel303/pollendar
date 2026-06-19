import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Mock the public-poll api module so the real store fetches controlled data with no network.
const { getPublicPoll, getResults, getParticipantResponses, submitResponses } = vi.hoisted(() => ({
  getPublicPoll: vi.fn<(token: string) => Promise<unknown>>(),
  getResults: vi.fn<(token: string) => Promise<unknown>>(),
  getParticipantResponses: vi.fn<(token: string) => Promise<unknown>>(),
  submitResponses: vi.fn<(token: string, payload: unknown) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/public-poll', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/public-poll')>()
  return { ...actual, getPublicPoll, getResults, getParticipantResponses, submitResponses }
})

// The thanks view reads the participant's edit token for the "Edit my response" link.
const { getParticipantToken } = vi.hoisted(() => ({
  getParticipantToken: vi.fn<(token: string) => string | null>(),
}))
vi.mock('@/lib/participantToken', () => ({ getParticipantToken }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicToken: 'tok' }, query: { name: 'Sam' } }),
}))

import PublicThanks from '../PublicThanks.vue'
import type { PublicPoll as PublicPollType, PollResults } from '@/lib/api/types'

function makePublicPoll(overrides: Partial<PublicPollType> = {}): PublicPollType {
  return {
    id: '42',
    title: 'Team dinner',
    description: null,
    timezone: 'Europe/Brussels',
    status: 'open',
    dates: [],
    ...overrides,
  }
}

const RESULTS: PollResults = {
  best: { slotId: 'S1', date: '2026-06-26', label: 'Dinner', score: 3 },
  slots: [{ slotId: 'S1', available: 3, maybe: 0, unavailable: 0, score: 3 }],
}

async function mountThanks(results: PollResults): Promise<VueWrapper> {
  getPublicPoll.mockResolvedValue(makePublicPoll())
  getResults.mockResolvedValue(results)
  getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })
  const wrapper = mount(PublicThanks, {
    global: { stubs: { CopyButton: true, RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getParticipantToken.mockReturnValue(null)
})

describe('PublicThanks', () => {
  it('drives a single cold load that fetches poll + results + participants once on mount', async () => {
    await mountThanks(RESULTS)
    expect(getPublicPoll).toHaveBeenCalledTimes(1)
    expect(getResults).toHaveBeenCalledTimes(1)
    expect(getParticipantResponses).toHaveBeenCalledTimes(1)
    expect(getPublicPoll).toHaveBeenCalledWith('tok')
    expect(getResults).toHaveBeenCalledWith('tok')
    expect(getParticipantResponses).toHaveBeenCalledWith('tok', undefined, undefined)
  })

  it('renders the bloom card with the best-slot heading when results have a best', async () => {
    const wrapper = await mountThanks(RESULTS)
    expect(wrapper.text()).toContain('Top pick')
    expect(wrapper.text()).toContain('Dinner')
  })

  it('hides the bloom section but keeps the share section when there is no best slot', async () => {
    const wrapper = await mountThanks({ best: null, slots: [] })
    expect(wrapper.text()).not.toContain('Top pick')
    // The share section's own heading renders even with `CopyButton` stubbed (its slot text does not).
    expect(wrapper.text()).toContain('Help find the time everyone can make')
  })

  it('echoes the query name in the hero', async () => {
    const wrapper = await mountThanks(RESULTS)
    expect(wrapper.text()).toContain('Thanks Sam')
  })
})
