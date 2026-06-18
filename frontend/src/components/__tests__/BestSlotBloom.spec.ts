import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BestSlotBloom from '../BestSlotBloom.vue'
import type { BestSlot, PollStatus, SlotMeta } from '@/lib/api/types'

const TZ = 'Europe/Brussels'
const BEST: BestSlot = { slotId: 's1', date: '2026-06-26', label: 'Early', score: 10 }
const META: SlotMeta = {
  slot: { id: 's1', startTime: '18:00:00', endTime: '20:00:00', isAllDay: false, label: 'Early', sortOrder: 0 },
  date: '2026-06-26',
}

function mountBloom(overrides: Partial<Record<string, unknown>> = {}) {
  return mount(BestSlotBloom, {
    props: {
      best: BEST,
      meta: META,
      timezone: TZ,
      status: 'open' as PollStatus,
      completedAt: null,
      available: 5,
      participantCount: 5,
      ...overrides,
    },
  })
}

describe('BestSlotBloom', () => {
  it('renders the score, the date label, and the slot label in the poll timezone', () => {
    const wrapper = mountBloom()

    expect(wrapper.get('[data-testid="best-slot-bloom"]').text()).toContain('10')
    // 2026-06-26 renders as "Fri Jun 26" (UTC-anchored, comma-less).
    expect(wrapper.text()).toContain('Jun 26')
    expect(wrapper.text()).toContain('Early')
  })

  it('shows the Complete button only while the poll is open', () => {
    expect(mountBloom({ status: 'open' }).find('[data-testid="complete-btn"]').exists()).toBe(true)

    const completed = mountBloom({ status: 'completed', completedAt: '2026-06-27T12:00:00.000Z' })
    expect(completed.find('[data-testid="complete-btn"]').exists()).toBe(false)
    expect(completed.text()).toContain('Completed')
  })

  it('emits complete when the Complete button is clicked', async () => {
    const wrapper = mountBloom({ status: 'open' })

    await wrapper.get('[data-testid="complete-btn"]').trigger('click')

    expect(wrapper.emitted('complete')).toHaveLength(1)
  })

  it('renders a calm empty hint and no Complete button when there is no winner', () => {
    const wrapper = mountBloom({ best: null, meta: null })

    expect(wrapper.find('[data-testid="complete-btn"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No responses yet')
  })
})
