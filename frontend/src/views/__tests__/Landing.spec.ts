import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import Landing from '../Landing.vue'

// Landing is a static pitch page; stub EmailGate so the test stays on Landing's own copy and never
// pulls in the auth store / router that EmailGate wires up.
function mountLanding() {
  return mount(Landing, { global: { stubs: { EmailGate: true } } })
}

describe('Landing copy', () => {
  it('renders the plain eyebrow + hero + tagline, with no "in bloom"/"like pollen" voice', () => {
    const text = mountLanding().text()

    expect(text).toContain('Group availability polling')
    expect(text).toContain('Find the time everyone can make.')
    expect(text).toContain(
      "Everyone marks when they're free, and Pollendar shows the time that works best.",
    )

    // The old metaphor-as-explanation copy is gone.
    expect(text).not.toContain('in bloom')
    expect(text).not.toContain('like pollen')
    expect(text).not.toContain('blooms')
  })

  it('labels the preview poll status as "collecting responses" (not "gathering")', () => {
    const text = mountLanding().text()

    expect(text).toContain('Europe/Brussels · collecting responses')
    expect(text).not.toContain('gathering responses')
  })
})
