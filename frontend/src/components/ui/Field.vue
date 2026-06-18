<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{
  label: string
  hint?: string
  error?: string
  invalid?: boolean
}>()

const id = useId()

// A field is invalid when explicitly flagged or when it carries an error message.
const isInvalid = computed<boolean>(() => props.invalid === true || !!props.error)
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-medium text-moonlight">{{ label }}</label>
    <!-- Slot the control; expose `id` + `invalid` so it can wire `aria-invalid` and the label. -->
    <slot :id="id" :invalid="isInvalid" />
    <p v-if="error" class="mt-1.5 flex items-center gap-1.5 text-xs text-coral">
      <span aria-hidden="true">⚠</span>{{ error }}
    </p>
    <p v-else-if="hint" class="mt-1.5 text-xs text-mute">{{ hint }}</p>
  </div>
</template>
