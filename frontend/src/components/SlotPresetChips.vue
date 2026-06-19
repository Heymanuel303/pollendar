<script setup lang="ts">
import { ref } from 'vue'
import { slotPresets, presetToSlot, type SlotPreset } from '@/lib/slotPresets'
import type { PollSlotInput } from '@/types/poll'

/**
 * Controlled, presentational preset picker: one toggle-chip per {@link slotPresets} entry plus a
 * "Custom" start/end range row. Owns **no** in-place mutation, every change emits a brand-new
 * `PollSlotInput[]` (mirroring `DateSlotEditor` / `SlotRow` ownership), so the component is a pure
 * function of its `modelValue` prop. A chip is "active" when the model already contains a slot
 * matching that preset by value (`isAllDay` + `startTime` + `endTime`).
 */
const props = defineProps<{ modelValue: PollSlotInput[]; showErrors?: boolean }>()

const emit = defineEmits<{ 'update:modelValue': [PollSlotInput[]] }>()

const customStart = ref<string>('')
const customEnd = ref<string>('')

/** Match by value, not identity, so chips reflect any model assembled elsewhere. */
function slotMatchesPreset(slot: PollSlotInput, preset: SlotPreset): boolean {
  if (preset.isAllDay) return slot.isAllDay === true
  return (
    slot.isAllDay !== true && slot.startTime === preset.startTime && slot.endTime === preset.endTime
  )
}

function isActive(preset: SlotPreset): boolean {
  return props.modelValue.some((slot) => slotMatchesPreset(slot, preset))
}

function toggle(preset: SlotPreset): void {
  if (isActive(preset)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((slot) => !slotMatchesPreset(slot, preset)),
    )
  } else {
    emit('update:modelValue', [...props.modelValue, presetToSlot(preset)])
  }
}

function addCustom(): void {
  if (customStart.value === '' || customEnd.value === '') return
  emit('update:modelValue', [
    ...props.modelValue,
    { isAllDay: false, startTime: customStart.value, endTime: customEnd.value, label: 'Custom' },
  ])
  customStart.value = ''
  customEnd.value = ''
}

const timeFieldClass =
  'field-sizing-content rounded-md border border-line bg-canvas px-2 py-1 text-center font-display text-sm text-moonlight focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30'
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="preset in slotPresets"
        :key="preset.id"
        type="button"
        class="touch-target inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition"
        :class="
          isActive(preset)
            ? 'bg-yes text-canvas shadow-glow'
            : 'border border-line text-dim hover:text-moonlight'
        "
        :aria-pressed="isActive(preset)"
        @click="toggle(preset)"
      >
        {{ preset.label }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="customStart"
        type="time"
        aria-label="Custom start time"
        :class="timeFieldClass"
      />
      <span class="text-mute">–</span>
      <input v-model="customEnd" type="time" aria-label="Custom end time" :class="timeFieldClass" />
      <button
        type="button"
        class="touch-target inline-flex items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-dim transition hover:text-pollen"
        @click="addCustom"
      >
        Add
      </button>
    </div>

    <p
      v-if="showErrors === true && modelValue.length === 0"
      class="flex items-center gap-1.5 text-sm text-coral"
    >
      <span aria-hidden="true">⚠</span>Pick at least one slot.
    </p>
  </div>
</template>
