<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'text' | 'email'
    textarea?: boolean
    invalid?: boolean
    placeholder?: string
    rows?: number
    disabled?: boolean
  }>(),
  {
    type: 'text',
    textarea: false,
    invalid: false,
    rows: 3,
  },
)

const model = defineModel<string>({ default: '' })

const base =
  'w-full rounded-xl border bg-canvas px-4 py-3 text-moonlight placeholder:text-mute focus:outline-none focus:ring-2'

const stateClass = computed<string>(() =>
  props.invalid
    ? 'border-coral focus:border-coral focus:ring-coral/30'
    : 'border-line focus:border-pollen focus:ring-pollen/30',
)
</script>

<template>
  <textarea
    v-if="textarea"
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :class="[base, stateClass, 'resize-none']"
  />
  <input
    v-else
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :class="[base, stateClass]"
  />
</template>
