<script setup lang="ts">
import { computed } from 'vue'

type Tone = 'neutral' | 'pollen' | 'mint' | 'coral'

const props = withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })

const base = 'inline-flex items-center rounded-full px-3 py-1 text-xs'

const toneClass = computed<string>(() => {
  switch (props.tone) {
    case 'pollen':
      return 'bg-pollen/15 text-pollen ring-1 ring-pollen/40'
    case 'mint':
      return 'bg-mint/15 text-mint'
    case 'coral':
      return 'bg-coral/15 text-coral'
    case 'neutral':
    default:
      return 'bg-surface2 text-dim'
  }
})
</script>

<template>
  <span :class="[base, toneClass]">
    <slot />
  </span>
</template>
