import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '../Button.vue'

describe('Button', () => {
  it('renders the primary variant signature classes by default', () => {
    const wrapper = mount(Button, { slots: { default: 'New poll' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-pollen', 'shadow-glow']))
    expect(wrapper.text()).toBe('New poll')
  })

  it('renders the secondary variant signature classes', () => {
    const wrapper = mount(Button, { props: { variant: 'secondary' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-line', 'bg-surface']))
  })

  it('renders the ghost variant signature classes', () => {
    const wrapper = mount(Button, { props: { variant: 'ghost' } })
    expect(wrapper.classes()).toContain('text-dim')
  })

  it('renders the danger variant signature classes', () => {
    const wrapper = mount(Button, { props: { variant: 'danger' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-coral/40', 'text-coral']))
  })

  it('disables the button and shows the spinner when loading', () => {
    const wrapper = mount(Button, { props: { loading: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('svg.animate-spin').exists()).toBe(true)
  })

  it('does not emit click while loading or disabled', async () => {
    const wrapper = mount(Button, { props: { loading: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('emits click when enabled', async () => {
    const wrapper = mount(Button)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('uses the disabled-primary token classes when disabled', () => {
    const wrapper = mount(Button, { props: { disabled: true } })
    expect(wrapper.classes()).toContain('bg-pollen/40')
  })
})
