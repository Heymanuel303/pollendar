<script setup lang="ts">
import { computed } from 'vue'
import type { Availability } from '@/lib/api/types'

/**
 * Tri-state Yes / Maybe / No button group for one slot, used `v-model`-style.
 *
 * The UI labels map to the backend `Availability` enum — **Yes → `available`**, **Maybe → `maybe`**,
 * **No → `unavailable`** — so the wire value is never the UI label. Re-tapping the active button
 * cycles back to "none" (`null`). Buttons are real `<button type="button">` with `aria-pressed`, and
 * the group carries an accessible label.
 */
const props = withDefaults(
  defineProps<{ modelValue: Availability | null; label?: string }>(),
  { label: 'Your availability for this slot' },
)

const emit = defineEmits<{ 'update:modelValue': [Availability | null] }>()

/** Display order + the active-state classes per the Dusk Calendar mockup. */
const options: { label: string; value: Availability; active: string }[] = [
  { label: 'Yes', value: 'available', active: 'bg-yes text-canvas shadow-glow' },
  { label: 'Maybe', value: 'maybe', active: 'bg-maybe text-canvas' },
  { label: 'No', value: 'unavailable', active: 'bg-no text-moonlight' },
]

const inactive = 'text-dim hover:text-moonlight focus:ring-2 focus:ring-pollen/40'

function select(value: Availability): void {
  // Re-tapping the active option clears the selection (cycle to "none").
  emit('update:modelValue', props.modelValue === value ? null : value)
}

const isActive = computed(() => (value: Availability) => props.modelValue === value)
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex w-full sm:inline-flex sm:w-auto rounded-xl border border-line bg-canvas p-1 text-sm font-medium"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :aria-pressed="isActive(opt.value)"
      :class="[
        'flex-1 sm:flex-none inline-flex items-center justify-center min-h-11 rounded-lg px-3 py-2.5 transition focus:outline-none',
        isActive(opt.value) ? opt.active : inactive,
      ]"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
