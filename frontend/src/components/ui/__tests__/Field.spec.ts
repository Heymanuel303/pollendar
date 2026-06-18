import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import Field from '../Field.vue'

// Slot a bare control that wires `aria-invalid` from the Field's `invalid` slot prop.
function mountWithControl(props: {
  label: string
  hint?: string
  error?: string
  invalid?: boolean
}) {
  return mount(Field, {
    props,
    slots: {
      default: (slotProps: { id: string; invalid: boolean }) =>
        h('input', {
          id: slotProps.id,
          'aria-invalid': slotProps.invalid ? 'true' : undefined,
        }),
    },
  })
}

describe('Field', () => {
  it('renders the label text', () => {
    const wrapper = mountWithControl({ label: 'Poll title' })
    expect(wrapper.find('label').text()).toBe('Poll title')
  })

  it('shows the error text and marks the slotted control invalid', () => {
    const wrapper = mountWithControl({
      label: 'Poll title',
      error: 'A title is needed before you can share this poll.',
    })
    expect(wrapper.text()).toContain('A title is needed before you can share this poll.')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('shows the hint when there is no error', () => {
    const wrapper = mountWithControl({ label: 'Poll title', hint: 'Shown to everyone you invite.' })
    expect(wrapper.text()).toContain('Shown to everyone you invite.')
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('hides the hint when an error is present', () => {
    const wrapper = mountWithControl({ label: 'Poll title', hint: 'a hint', error: 'an error' })
    expect(wrapper.text()).toContain('an error')
    expect(wrapper.text()).not.toContain('a hint')
  })

  it('links the label to the control via id', () => {
    const wrapper = mountWithControl({ label: 'Poll title' })
    const forAttr = wrapper.find('label').attributes('for')
    expect(forAttr).toBeTruthy()
    expect(wrapper.find('input').attributes('id')).toBe(forAttr)
  })
})
