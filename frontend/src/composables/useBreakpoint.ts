import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Reactive breakpoint composable backed by `window.matchMedia`, aligned to the
 * Tailwind v4 token breakpoints (`sm` 640px, `md` 768px, `lg` 1024px).
 *
 * Dependency-free and pure (no Pinia, no router). SSR/build-safe: refs are
 * initialised from a `typeof window` guard so the module can be imported during
 * the Vite/type-check build without a DOM. Returns only the public derived refs;
 * the raw matchMedia refs stay internal.
 */
export function useBreakpoint() {
  const hasWindow = typeof window !== 'undefined'

  const sm = ref(hasWindow ? window.matchMedia('(min-width: 640px)').matches : false)
  const md = ref(hasWindow ? window.matchMedia('(min-width: 768px)').matches : false)
  const lg = ref(hasWindow ? window.matchMedia('(min-width: 1024px)').matches : false)

  const subscriptions: { mql: MediaQueryList; handler: (e: MediaQueryListEvent) => void }[] = []

  onMounted(() => {
    if (!hasWindow) return

    const specs: [Ref<boolean>, string][] = [
      [sm, '(min-width: 640px)'],
      [md, '(min-width: 768px)'],
      [lg, '(min-width: 1024px)'],
    ]

    for (const [target, query] of specs) {
      const mql = window.matchMedia(query)
      target.value = mql.matches
      const handler = (e: MediaQueryListEvent) => {
        target.value = e.matches
      }
      mql.addEventListener('change', handler)
      subscriptions.push({ mql, handler })
    }
  })

  onUnmounted(() => {
    for (const { mql, handler } of subscriptions) {
      mql.removeEventListener('change', handler)
    }
    subscriptions.length = 0
  })

  // `md` participates in the matchMedia wiring above but the public surface is
  // the three named tiers below; `md` is intentionally retained for future tiers.
  void md.value

  const isPhone = computed(() => !sm.value)
  const isTablet = computed(() => sm.value && !lg.value)
  const isDesktop = computed(() => lg.value)

  return { isPhone, isTablet, isDesktop }
}
