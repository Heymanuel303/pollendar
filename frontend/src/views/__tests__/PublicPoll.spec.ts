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

const push = vi.fn<(to: unknown) => Promise<void>>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicToken: 'tok' } }),
  useRouter: () => ({ push }),
}))

import PublicPoll from '../PublicPoll.vue'
import PollSlotRow from '@/components/PollSlotRow.vue'
import type { PublicPoll as PublicPollType, PollResults } from '@/lib/api/types'

function makePublicPoll(overrides: Partial<PublicPollType> = {}): PublicPollType {
  return {
    id: '42',
    title: 'Team dinner',
    description: null,
    timezone: 'Europe/Brussels',
    status: 'open',
    dates: [
      {
        id: 'D1',
        eventDate: '2026-06-26',
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
          },
        ],
      },
    ],
    ...overrides,
  }
}

const RESULTS: PollResults = {
  best: { slotId: 'S1', date: '2026-06-26', label: 'Dinner', score: 3 },
  slots: [{ slotId: 'S1', available: 3, maybe: 0, unavailable: 0, score: 3 }],
}

async function mountWithPoll(poll: PublicPollType): Promise<VueWrapper> {
  getPublicPoll.mockResolvedValue(poll)
  getResults.mockResolvedValue(RESULTS)
  getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })
  const wrapper = mount(PublicPoll, {
    global: { stubs: { RouterLink: RouterLinkStub, ParticipantMatrix: true } },
  })
  await flushPromises()
  return wrapper
}

function nameInput(wrapper: VueWrapper) {
  return wrapper.find('#participant-name').element as HTMLInputElement
}
function emailInput(wrapper: VueWrapper) {
  return wrapper.find('#participant-email').element as HTMLInputElement
}
function hasSubmitBar(wrapper: VueWrapper): boolean {
  return wrapper.findAll('button').some((b) => b.text().includes('Submit availability'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('PublicPoll — closed (cancelled) state', () => {
  it('shows the Closed chip + cancelled banner, disables controls, hides the submit bar, keeps results', async () => {
    const wrapper = await mountWithPoll(makePublicPoll({ status: 'cancelled' }))

    // Closed chip + "no longer accepting responses" subtext.
    expect(wrapper.text()).toContain('Closed')
    expect(wrapper.text()).toContain('no longer accepting responses')
    // Cancelled-specific banner copy.
    expect(wrapper.text()).toContain('This poll was cancelled by the organizer')

    // Voting controls disabled.
    expect(wrapper.findComponent(PollSlotRow).props('disabled')).toBe(true)
    expect(nameInput(wrapper).disabled).toBe(true)
    expect(emailInput(wrapper).disabled).toBe(true)

    // Sticky submit bar gone.
    expect(hasSubmitBar(wrapper)).toBe(false)

    // Results still render (a best exists → not the empty fallback).
    expect(wrapper.text()).toContain('Leaning so far')
    expect(wrapper.text()).not.toContain('No responses yet.')
  })
})

describe('PublicPoll — open state', () => {
  it('renders the sticky submit bar, enables controls, and shows the Open chip', async () => {
    const wrapper = await mountWithPoll(makePublicPoll({ status: 'open' }))

    expect(wrapper.text()).toContain('Open')
    expect(hasSubmitBar(wrapper)).toBe(true)
    expect(wrapper.findComponent(PollSlotRow).props('disabled')).toBe(false)
    expect(nameInput(wrapper).disabled).toBe(false)
    expect(emailInput(wrapper).disabled).toBe(false)
  })
})
