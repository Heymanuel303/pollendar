import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Drive the verify action, the router, and the route query from the test.
const { verify, replace, route } = vi.hoisted(() => ({
  verify: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, unknown> },
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ verify }) }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

import AuthCallback from '../AuthCallback.vue'

function mountCallback() {
  // The error state renders a <RouterLink>, which isn't globally registered without the plugin.
  return mount(AuthCallback, { global: { stubs: { RouterLink: true } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  route.query = {}
})

describe('AuthCallback', () => {
  it('shows the missing-token error without calling verify', async () => {
    route.query = {}
    const wrapper = mountCallback()
    await flushPromises()

    expect(verify).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('missing its token')
  })

  it('shows the expired-link error when verify rejects — never a blank loader', async () => {
    route.query = { token: 'expired' }
    verify.mockRejectedValue(new Error('401'))
    const wrapper = mountCallback()
    await flushPromises()

    expect(verify).toHaveBeenCalledWith('expired')
    expect(wrapper.text()).toContain('expired or was already used')
    expect(wrapper.text()).not.toContain('Signing you in')
  })

  it('redirects to /dashboard on a successful verify', async () => {
    route.query = { token: 'good' }
    verify.mockResolvedValue(undefined)
    const wrapper = mountCallback()
    await flushPromises()

    expect(verify).toHaveBeenCalledWith('good')
    expect(replace).toHaveBeenCalledWith('/dashboard')
    expect(wrapper.text()).not.toContain('did')
  })
})
