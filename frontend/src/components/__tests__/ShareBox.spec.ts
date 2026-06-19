import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ShareBox from '../ShareBox.vue'
import type { BestSlot, Poll, SlotMeta } from '@/lib/api/types'

const SHARE_URL = 'https://pollendar.app/p/Vk2pQ8sLrZ0'
const BEST: BestSlot = { slotId: 's1', date: '2026-06-26', label: 'Early', score: 10 }
const META: SlotMeta = {
  slot: {
    id: 's1',
    startTime: '18:00:00',
    endTime: '20:00:00',
    isAllDay: false,
    label: 'Early',
    sortOrder: 0,
    invalidatedAt: null,
  },
  date: '2026-06-26',
}

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: '42',
    title: 'Team dinner',
    description: 'Looking for a good evening next week.',
    timezone: 'Europe/Brussels',
    status: 'open',
    publicToken: 'Vk2pQ8sLrZ0',
    closesAt: '2026-06-25T18:00:00.000Z',
    finalSlotId: null,
    completedAt: null,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    dates: [],
    ...overrides,
  }
}

function mountBox(poll: Poll) {
  return mount(ShareBox, { props: { poll, shareUrl: SHARE_URL, best: BEST, bestMeta: META } })
}

describe('ShareBox', () => {
  it('exposes the public link as the readonly share field', () => {
    const wrapper = mountBox(makePoll())
    expect(wrapper.get('[data-testid="share-link"]').attributes('value')).toBe(SHARE_URL)
  })

  it('builds the §7 invite message with the title and share URL', () => {
    const message = mountBox(makePoll()).get('[data-testid="invite-message"]').text()
    expect(message).toContain('Team dinner')
    expect(message).toContain(SHARE_URL)
  })

  it('includes the "Please reply before" line only when the poll has a close time', () => {
    expect(mountBox(makePoll()).get('[data-testid="invite-message"]').text()).toContain(
      'Please reply before',
    )
    expect(
      mountBox(makePoll({ closesAt: null }))
        .get('[data-testid="invite-message"]')
        .text(),
    ).not.toContain('Please reply before')
  })

  it('copies the link to the clipboard and confirms with a Copied state', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mountBox(makePoll())
    const copyLink = wrapper.findAll('button').find((b) => b.text().includes('Copy link'))!
    await copyLink.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(SHARE_URL)
    expect(copyLink.text()).toContain('Copied')
  })

  // Phase 3 responsive pass: copy button stretches full-width on phones, no label wrap.
  it('makes the copy button full-width on phones and keeps its label on one line', () => {
    const copyLink = mountBox(makePoll())
      .findAll('button')
      .find((b) => b.text().includes('Copy link'))!
    expect(copyLink.classes()).toEqual(
      expect.arrayContaining(['w-full', 'sm:w-auto', 'whitespace-nowrap']),
    )
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
