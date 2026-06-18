<script setup lang="ts">
import { computed } from 'vue'
import type { PollSlotInput } from '@/types/poll'

/**
 * One slot in a candidate date: a label, an All-day / Set-times toggle, and start/end time inputs.
 * Owns no array logic — it emits an immutable replacement of its slot upward (the parent date owns
 * the slot list) and a bare `remove` event. `showErrors` (set by the editor after a failed submit)
 * reveals the per-slot validation message: a time-range slot needs both a start and an end.
 */
const props = defineProps<{ modelValue: PollSlotInput; showErrors?: boolean }>()

const emit = defineEmits<{ 'update:modelValue': [PollSlotInput]; remove: [] }>()

function patch(changes: Partial<PollSlotInput>): void {
  emit('update:modelValue', { ...props.modelValue, ...changes })
}

const label = computed<string>({
  get: () => props.modelValue.label ?? '',
  set: (value) => patch({ label: value === '' ? undefined : value }),
})

const startTime = computed<string>({
  get: () => props.modelValue.startTime ?? '',
  set: (value) => patch({ startTime: value === '' ? undefined : value }),
})

const endTime = computed<string>({
  get: () => props.modelValue.endTime ?? '',
  set: (value) => patch({ endTime: value === '' ? undefined : value }),
})

const isAllDay = computed<boolean>(() => props.modelValue.isAllDay === true)

// Drop times when switching to all-day; seed a sensible range when switching back to set-times.
function setAllDay(value: boolean): void {
  if (value) {
    patch({ isAllDay: true, startTime: undefined, endTime: undefined })
  } else {
    patch({
      isAllDay: false,
      startTime: props.modelValue.startTime ?? '18:00',
      endTime: props.modelValue.endTime ?? '20:00',
    })
  }
}

// A time-range slot is incomplete until it has both ends.
const invalid = computed<boolean>(
  () => !isAllDay.value && (!props.modelValue.startTime || !props.modelValue.endTime),
)
const showError = computed<boolean>(() => props.showErrors === true && invalid.value)

const timeFieldClass =
  'w-20 rounded-md border bg-canvas px-2 py-1 text-center font-display text-sm text-moonlight focus:outline-none focus:ring-2'
const timeStateClass = computed<string>(() =>
  showError.value
    ? 'border-coral focus:border-coral focus:ring-coral/30'
    : 'border-line focus:border-pollen focus:ring-pollen/30',
)
</script>

<template>
  <div class="rounded-lg border border-line bg-surface px-3 py-2.5 transition hover:bg-surface2">
    <div class="flex flex-wrap items-center gap-2">
      <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>

      <input
        v-model="label"
        aria-label="Slot label"
        placeholder="Label"
        class="w-24 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
      />

      <!-- All-day / Set-times segmented toggle -->
      <div class="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-xs font-medium">
        <button
          type="button"
          :class="
            isAllDay
              ? 'rounded-md bg-yes px-2.5 py-1 text-canvas shadow-glow'
              : 'rounded-md px-2.5 py-1 text-dim transition hover:text-moonlight'
          "
          @click="setAllDay(true)"
        >
          All day
        </button>
        <button
          type="button"
          :class="
            !isAllDay
              ? 'rounded-md bg-yes px-2.5 py-1 text-canvas shadow-glow'
              : 'rounded-md px-2.5 py-1 text-dim transition hover:text-moonlight'
          "
          @click="setAllDay(false)"
        >
          Set times
        </button>
      </div>

      <template v-if="!isAllDay">
        <input
          v-model="startTime"
          type="time"
          aria-label="Start time"
          :aria-invalid="showError || undefined"
          :class="[timeFieldClass, timeStateClass]"
        />
        <span class="text-mute">–</span>
        <input
          v-model="endTime"
          type="time"
          aria-label="End time"
          :aria-invalid="showError || undefined"
          :class="[timeFieldClass, timeStateClass]"
        />
      </template>
      <span v-else class="text-sm text-mute">No fixed time</span>

      <button
        type="button"
        class="ml-auto rounded-md px-2 py-1 text-sm text-mute transition hover:text-coral"
        aria-label="Remove slot"
        @click="emit('remove')"
      >
        ✕
      </button>
    </div>

    <p v-if="showError" class="mt-1.5 flex items-center gap-1.5 text-xs text-coral">
      <span aria-hidden="true">⚠</span>Set a start and end time, or mark it all-day.
    </p>
  </div>
</template>
