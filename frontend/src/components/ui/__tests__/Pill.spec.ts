import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Pill from '../Pill.vue'

describe('Pill', () => {
  it('maps the neutral tone to its token classes (default)', () => {
    const wrapper = mount(Pill, { slots: { default: 'gathering responses' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-surface2', 'text-dim']))
    expect(wrapper.text()).toBe('gathering responses')
  })

  it('maps the pollen tone to its token classes', () => {
    const wrapper = mount(Pill, { props: { tone: 'pollen' } })
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['bg-pollen/15', 'text-pollen', 'ring-pollen/40']),
    )
  })

  it('maps the mint tone to its token classes', () => {
    const wrapper = mount(Pill, { props: { tone: 'mint' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-mint/15', 'text-mint']))
  })

  it('maps the coral tone to its token classes', () => {
    const wrapper = mount(Pill, { props: { tone: 'coral' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-coral/15', 'text-coral']))
  })
})
