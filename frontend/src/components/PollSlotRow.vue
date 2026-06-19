<script setup lang="ts">
import { computed } from 'vue'
import AvailabilityToggle from '@/components/AvailabilityToggle.vue'
import { formatTime } from '@/lib/utils/timezone'
import type { Availability, PollSlot } from '@/lib/api/types'

/**
 * A single slot row in the participant flow: label + time range (rendered in the poll's timezone),
 * an optional "✦ In bloom" treatment for the current best slot, and the tri-state availability
 * toggle. Keeps `PublicPoll` thin — it owns no fetch/submit logic.
 */
// Named `pollSlot` (not `slot`): a `:slot` template binding collides with Vue's deprecated
// named-slot attribute (eslint vue/no-deprecated-slot-attribute).
const props = defineProps<{
  pollSlot: PollSlot
  /** The slot's candidate `"YYYY-MM-DD"` date (kept for callers/labels; the row renders only times). */
  eventDate: string
  /** The poll's IANA timezone — documented on the time line; the wall-clock value is naive (see formatTime). */
  timezone: string
  /** When true, apply the bloom treatment (the current best slot from live results). */
  isBest?: boolean
  /** When true (closed poll), render the toggle read-only so the Vote tab stays visible but inert. */
  disabled?: boolean
  modelValue: Availability | null
}>()

const emit = defineEmits<{ 'update:modelValue': [Availability | null] }>()

const slotLabel = computed<string>(
  () => props.pollSlot.label ?? (props.pollSlot.isAllDay ? 'All day' : 'Slot'),
)

/** All-day slots read "Any time works"; timed slots render `HH:mm–HH:mm` (or a single start). */
const timeLine = computed<string>(() => {
  if (props.pollSlot.isAllDay || !props.pollSlot.startTime) return 'Any time works'
  const start = formatTime(props.pollSlot.startTime, props.timezone)
  return props.pollSlot.endTime
    ? `${start}–${formatTime(props.pollSlot.endTime, props.timezone)}`
    : start
})
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-3 rounded-xl border p-4 transition sm:flex-row sm:items-center sm:justify-between',
      isBest
        ? 'bloom-bg border-pollen/40 bg-canvas shadow-glow'
        : 'border-line bg-canvas hover:bg-surface2',
    ]"
  >
    <div class="flex items-center gap-3">
      <span v-if="isBest" class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
      <div>
        <p class="font-medium text-moonlight">{{ slotLabel }}</p>
        <p class="num text-sm text-dim">{{ timeLine }}</p>
      </div>
      <span
        v-if="isBest"
        class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
        >✦ In bloom</span
      >
    </div>

    <AvailabilityToggle
      :model-value="modelValue"
      :disabled="disabled"
      :label="`Your availability for ${slotLabel}`"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
