import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import PollCard from '../PollCard.vue'
import type { Poll } from '@/stores/pollStore'

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: '42',
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

function mountCard(poll: Poll) {
  // The primary action is a <RouterLink>; stub it so its `to` is inspectable without a real router.
  return mount(PollCard, { props: { poll }, global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('PollCard', () => {
  it('renders the "Open" badge and a "Manage" action for an open poll', () => {
    const wrapper = mountCard(makePoll({ status: 'open' }))

    expect(wrapper.text()).toContain('Open')
    expect(wrapper.findComponent(RouterLinkStub).text()).toContain('Manage')
  })

  it('renders the "Completed" badge and a "View results" action for a completed poll', () => {
    const wrapper = mountCard(makePoll({ status: 'completed' }))

    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.findComponent(RouterLinkStub).text()).toContain('View results')
  })

  it('routes its primary action to /polls/{id} using the string id', () => {
    const wrapper = mountCard(makePoll({ id: '789' }))

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/polls/789')
  })

  it('renders one .pollen-dot per response and the count line when a count is supplied', () => {
    const wrapper = mountCard(makePoll({ responseCount: 3 }))

    expect(wrapper.findAll('.pollen-dot')).toHaveLength(3)
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('responses')
  })

  it('reads the count from the _count.participants aggregate when present', () => {
    const wrapper = mountCard(makePoll({ _count: { participants: 2 } }))

    expect(wrapper.findAll('.pollen-dot')).toHaveLength(2)
  })

  it('renders no grains and no count line when the count is absent (the real-API shape)', () => {
    const wrapper = mountCard(makePoll())

    expect(wrapper.findAll('.pollen-dot')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('responses')
  })

  it('emits the poll on Share without navigating', async () => {
    const poll = makePoll()
    const wrapper = mountCard(poll)

    const share = wrapper.findAll('button').find((b) => b.text().includes('Share'))
    await share?.trigger('click')

    // The emitted payload is the reactive proxy of the prop (deep-equal, not reference-equal).
    expect(wrapper.emitted('share')?.[0]?.[0]).toStrictEqual(poll)
  })
})
