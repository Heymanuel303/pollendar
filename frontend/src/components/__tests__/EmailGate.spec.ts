import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Spy directly on the store action the component is meant to call.
const { requestLink } = vi.hoisted(() => ({
  requestLink: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ requestLink }) }))

import EmailGate from '../EmailGate.vue'

beforeEach(() => {
  requestLink.mockReset()
  requestLink.mockResolvedValue({ ok: true })
})

describe('EmailGate', () => {
  it('sends the typed email through the store and swaps to the inbox confirmation', async () => {
    const wrapper = mount(EmailGate)

    await wrapper.find('input[type="email"]').setValue('manu@pollendar.app')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(requestLink).toHaveBeenCalledWith('manu@pollendar.app')
    expect(wrapper.text()).toContain('Check your inbox')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('does not call the store when the email is empty (native required blocks it)', async () => {
    const wrapper = mount(EmailGate)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(requestLink).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('returns to the request state when "Request again" is clicked', async () => {
    const wrapper = mount(EmailGate)

    await wrapper.find('input[type="email"]').setValue('manu@pollendar.app')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)

    await wrapper.get('button[type="button"]').trigger('click')

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Check your inbox')
  })
})
