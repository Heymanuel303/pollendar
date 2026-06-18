<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'primary',
    loading: false,
    disabled: false,
    type: 'button',
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const isDisabled = computed(() => props.disabled || props.loading)

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition'

const variantClass = computed<string>(() => {
  switch (props.variant) {
    case 'secondary':
      return 'border border-line bg-surface text-moonlight hover:bg-surface2'
    case 'ghost':
      return 'text-dim hover:text-moonlight'
    case 'danger':
      return 'border border-coral/40 bg-coral/10 text-coral hover:bg-coral/20'
    case 'primary':
    default:
      return isDisabled.value
        ? 'cursor-not-allowed bg-pollen/40 text-canvas/60'
        : 'bg-pollen text-canvas shadow-glow hover:brightness-110 active:translate-y-px'
  }
})

function onClick(event: MouseEvent) {
  if (isDisabled.value) return
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :class="[base, variantClass]"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    @click="onClick"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <slot />
  </button>
</template>
