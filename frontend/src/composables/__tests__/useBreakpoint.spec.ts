import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useBreakpoint } from '../useBreakpoint'

/**
 * Controllable `window.matchMedia` stub: jsdom doesn't implement it. Each query
 * starts unmatched; `setWidth` flips matches based on the `(min-width: Npx)`
 * thresholds and fires `change` on every registered listener so the composable's
 * computed tiers update reactively.
 */
function installMatchMedia() {
  type Entry = { query: string; min: number; matches: boolean; listeners: Set<(e: MediaQueryListEvent) => void> }
  const entries: Entry[] = []

  const matchMedia = vi.fn<(query: string) => MediaQueryList>((query: string): MediaQueryList => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity)
    const entry: Entry = { query, min, matches: false, listeners: new Set() }
    entries.push(entry)
    return {
      get matches() {
        return entry.matches
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => entry.listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => entry.listeners.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  })

  vi.stubGlobal('matchMedia', matchMedia)
  // Mirror onto window so both `matchMedia(...)` and `window.matchMedia(...)` resolve to the stub.
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })

  function setWidth(width: number) {
    for (const e of entries) {
      const next = width >= e.min
      if (next !== e.matches) {
        e.matches = next
        e.listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))
      }
    }
  }

  function listenerCount() {
    return entries.reduce((sum, e) => sum + e.listeners.size, 0)
  }

  return { matchMedia, setWidth, listenerCount }
}

/** Mount a throwaway component that exposes the composable's reactive return. */
function mountComposable() {
  const Host = defineComponent({
    setup() {
      return useBreakpoint()
    },
    render() {
      return null
    },
  })
  return mount(Host)
}

describe('useBreakpoint', () => {
  let mm: ReturnType<typeof installMatchMedia>

  beforeEach(() => {
    mm = installMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports phone tier below the sm breakpoint', async () => {
    const wrapper = mountComposable()
    await nextTick()
    mm.setWidth(375)
    await nextTick()

    expect(wrapper.vm.isPhone).toBe(true)
    expect(wrapper.vm.isTablet).toBe(false)
    expect(wrapper.vm.isDesktop).toBe(false)
  })

  it('reports tablet tier at sm and below lg', async () => {
    const wrapper = mountComposable()
    await nextTick()
    mm.setWidth(768)
    await nextTick()

    expect(wrapper.vm.isPhone).toBe(false)
    expect(wrapper.vm.isTablet).toBe(true)
    expect(wrapper.vm.isDesktop).toBe(false)
  })

  it('reports desktop tier at lg and up', async () => {
    const wrapper = mountComposable()
    await nextTick()
    mm.setWidth(1280)
    await nextTick()

    expect(wrapper.vm.isPhone).toBe(false)
    expect(wrapper.vm.isTablet).toBe(false)
    expect(wrapper.vm.isDesktop).toBe(true)
  })

  it('reacts to viewport changes after mount', async () => {
    const wrapper = mountComposable()
    await nextTick()

    mm.setWidth(375)
    await nextTick()
    expect(wrapper.vm.isPhone).toBe(true)

    mm.setWidth(1280)
    await nextTick()
    expect(wrapper.vm.isDesktop).toBe(true)
    expect(wrapper.vm.isPhone).toBe(false)
  })

  it('registers listeners on mount and removes them all on unmount', async () => {
    const wrapper = mountComposable()
    await nextTick()

    // One listener per breakpoint query (sm, md, lg).
    expect(mm.listenerCount()).toBe(3)

    wrapper.unmount()
    expect(mm.listenerCount()).toBe(0)
  })
})
