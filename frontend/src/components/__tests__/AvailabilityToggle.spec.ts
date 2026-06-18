import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AvailabilityToggle from '../AvailabilityToggle.vue'
import type { Availability } from '@/lib/api/types'

/** Mount the toggle with a given current value and return the wrapper + its three buttons by label. */
function mountToggle(modelValue: Availability | null = null) {
  const wrapper = mount(AvailabilityToggle, { props: { modelValue } })
  const buttons = wrapper.findAll('button')
  const byLabel = (label: string) => buttons.find((b) => b.text() === label)!
  return { wrapper, yes: byLabel('Yes'), maybe: byLabel('Maybe'), no: byLabel('No') }
}

describe('AvailabilityToggle', () => {
  it('maps the UI labels to backend enum values when clicked', async () => {
    const { wrapper, yes, maybe, no } = mountToggle(null)

    await yes.trigger('click')
    await maybe.trigger('click')
    await no.trigger('click')

    const events = wrapper.emitted('update:modelValue')
    expect(events).toBeTruthy()
    expect(events![0]).toEqual(['available'])
    expect(events![1]).toEqual(['maybe'])
    expect(events![2]).toEqual(['unavailable'])
  })

  it('re-clicking the active button cycles back to none (null)', async () => {
    const { wrapper, yes } = mountToggle('available')

    await yes.trigger('click')

    expect(wrapper.emitted('update:modelValue')![0]).toEqual([null])
  })

  it('reflects the current modelValue via aria-pressed', () => {
    const { yes, maybe, no } = mountToggle('maybe')

    expect(maybe.attributes('aria-pressed')).toBe('true')
    expect(yes.attributes('aria-pressed')).toBe('false')
    expect(no.attributes('aria-pressed')).toBe('false')
  })

  it('applies the active style class to the selected option only', () => {
    const { yes, maybe } = mountToggle('available')

    // Yes active → pollen fill; Maybe inactive → dim text.
    expect(yes.classes()).toContain('bg-yes')
    expect(maybe.classes()).not.toContain('bg-maybe')
    expect(maybe.classes()).toContain('text-dim')
  })

  // Phase 3 responsive pass: 44px touch targets + full-width group on phones.
  it('fills the row on phones and reverts to inline-flex at sm+', () => {
    const group = mountToggle(null).wrapper.get('[role="group"]')
    expect(group.classes()).toEqual(
      expect.arrayContaining(['flex', 'w-full', 'sm:inline-flex', 'sm:w-auto']),
    )
  })

  it('gives every option a 44px floor and an even share of the phone row', () => {
    const { yes, maybe, no } = mountToggle(null)
    for (const button of [yes, maybe, no]) {
      expect(button.classes()).toEqual(
        expect.arrayContaining(['min-h-11', 'flex-1', 'sm:flex-none']),
      )
    }
  })
})
