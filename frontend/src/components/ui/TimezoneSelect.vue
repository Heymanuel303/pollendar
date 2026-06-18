<script setup lang="ts">
import { commonTimezones } from '@/lib/utils/timezone'

// Styled appearance-none <select> over the runtime's IANA zones. The parent owns the default
// selection (PollEditor seeds it with `defaultTimezone()`); this component is a pure v-model input.
defineProps<{ id?: string; invalid?: boolean }>()

const model = defineModel<string>({ default: '' })

const zones = commonTimezones()
</script>

<template>
  <div class="relative">
    <select
      :id="id"
      v-model="model"
      :aria-invalid="invalid || undefined"
      class="w-full appearance-none rounded-xl border border-line bg-canvas px-4 py-3 pr-10 text-moonlight focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
    >
      <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
    </select>
    <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">▾</span>
  </div>
</template>
