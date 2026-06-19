import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Mock the api client's `get`/`post`/`del` so the store runs for real against a live Pinia but no
// network fires; `importOriginal` keeps the real `ApiError` so error-mapping branches still work.
const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
  post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  del: vi.fn<(path: string) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, get, post, del }
})

// Route id = 42; `useRouter().push` is a spy so the post-delete redirect is observable.
const push = vi.fn<(to: string) => Promise<void>>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '42' } }),
  useRouter: () => ({ push }),
}))

import { ApiError } from '@/lib/api/client'
import PollManage from '../PollManage.vue'
import BestSlotBloom from '@/components/BestSlotBloom.vue'
import type { Poll as OwnedPoll } from '@/lib/api/types'

function makePoll(overrides: Partial<OwnedPoll> = {}): OwnedPoll {
  return {
    id: '42',
    title: 'Team dinner',
    description: null,
    timezone: 'Europe/Brussels',
    status: 'open',
    publicToken: 'tok',
    closesAt: null,
    finalSlotId: null,
    completedAt: null,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    dates: [],
    ...overrides,
  }
}

function mountManage(): VueWrapper {
  return mount(PollManage, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        BestSlotBloom: true,
        AvailabilityGrid: true,
        ParticipantMatrix: true,
        BestSlotBadge: true,
        ShareBox: true,
      },
    },
  })
}

/** Mount with the detail GET resolving `poll`; the supplementary loads resolve empty/stable shapes. */
async function mountWithPoll(poll: OwnedPoll): Promise<VueWrapper> {
  get.mockImplementation((path: string) => {
    if (path === '/polls/42') return Promise.resolve(poll)
    if (path.endsWith('/results')) return Promise.resolve({ best: null, slots: [] })
    if (path.includes('participants-responses'))
      return Promise.resolve({ participants: [], total: 0, hasMore: false })
    if (path.includes('invite-message'))
      return Promise.resolve({ message: '', shareUrl: 'https://x/p/tok' })
    return Promise.resolve(null)
  })
  const wrapper = mountManage()
  await flushPromises()
  return wrapper
}

function buttonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

/** The action button inside the currently-open confirm dialog (distinct from the actions-row button). */
function dialogButton(wrapper: VueWrapper, text: string) {
  return wrapper
    .find('[role="dialog"]')
    .findAll('button')
    .find((b) => b.text() === text)
}

function editLink(wrapper: VueWrapper) {
  return wrapper.findAllComponents(RouterLinkStub).find((l) => l.text().includes('Edit poll'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('PollManage, status pill + Edit link + actions', () => {
  it('open poll: pollen "Open" pill, Edit link → /polls/42/edit, Cancel action, no Reopen', async () => {
    const wrapper = await mountWithPoll(makePoll())

    expect(wrapper.text()).toContain('Open · gathering responses')
    expect(editLink(wrapper)?.props('to')).toBe('/polls/42/edit')
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toContain('Cancel poll')
    expect(labels).not.toContain('Reopen poll')
  })

  it('completed poll: "Completed" pill, Reopen action, Edit link present', async () => {
    const wrapper = await mountWithPoll(
      makePoll({ status: 'completed', finalSlotId: 'S1', completedAt: '2026-06-18T12:00:00.000Z' }),
    )

    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('Reopen poll')
    expect(editLink(wrapper)).toBeTruthy()
  })

  it('cancelled poll: neutral "Cancelled" pill, bloom replaced by cancelled card, Reopen, no Edit link', async () => {
    const wrapper = await mountWithPoll(makePoll({ status: 'cancelled' }))

    expect(wrapper.text()).toContain('Cancelled')
    expect(wrapper.findComponent(BestSlotBloom).exists()).toBe(false)
    expect(wrapper.text()).toContain('This poll is cancelled')
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('Reopen poll')
    expect(editLink(wrapper)).toBeFalsy()
  })
})

describe('PollManage, lifecycle confirm dialogs', () => {
  it('Cancel: opens the dialog and confirming POSTs /polls/42/cancel', async () => {
    const wrapper = await mountWithPoll(makePoll())

    await buttonByText(wrapper, 'Cancel poll')!.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    post.mockResolvedValueOnce(makePoll({ status: 'cancelled' }))
    await dialogButton(wrapper, 'Cancel poll')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/polls/42/cancel')
  })

  it('Cancel: a thrown error keeps the dialog open and shows the coral lifecycle error', async () => {
    const wrapper = await mountWithPoll(makePoll())

    await buttonByText(wrapper, 'Cancel poll')!.trigger('click')
    post.mockRejectedValueOnce(new ApiError(409, { message: 'nope' }))
    await dialogButton(wrapper, 'Cancel poll')!.trigger('click')
    await flushPromises()

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('This poll is not in a state that allows that change.')
  })

  it('Reopen: confirming POSTs /polls/42/reopen', async () => {
    const wrapper = await mountWithPoll(
      makePoll({ status: 'completed', finalSlotId: 'S1', completedAt: '2026-06-18T12:00:00.000Z' }),
    )

    await buttonByText(wrapper, 'Reopen poll')!.trigger('click')
    post.mockResolvedValueOnce(makePoll({ status: 'open' }))
    await dialogButton(wrapper, 'Reopen poll')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/polls/42/reopen')
  })

  it('Delete: confirming DELETEs /polls/42 and pushes /dashboard', async () => {
    const wrapper = await mountWithPoll(makePoll())

    await buttonByText(wrapper, 'Delete poll')!.trigger('click')
    del.mockResolvedValueOnce(undefined)
    await dialogButton(wrapper, 'Delete poll')!.trigger('click')
    await flushPromises()

    expect(del).toHaveBeenCalledWith('/polls/42')
    expect(push).toHaveBeenCalledWith('/dashboard')
  })
})
