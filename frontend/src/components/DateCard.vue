<script setup lang="ts">
import { computed } from 'vue'
import SlotRow from '@/components/SlotRow.vue'
import { formatDate, formatDayNumber } from '@/lib/utils/timezone'
import type { PollDateInput, PollSlotInput } from '@/types/poll'

/**
 * One candidate date: a day-number chip, the formatted date label, its slot rows, and add/remove
 * actions. Like {@link SlotRow}, it owns no parent-array logic — every change emits an immutable
 * replacement of this date upward; the editor owns the date list. `showErrors` flows down to each
 * slot and also reveals the "needs at least one slot" message when the last slot was removed.
 */
const props = defineProps<{
  modelValue: PollDateInput
  timezone: string
  showErrors?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [PollDateInput]; remove: [] }>()

const slots = computed<PollSlotInput[]>(() => props.modelValue.slots)

const dateLabel = computed<string>(() => formatDate(props.modelValue.eventDate, props.timezone))
const dayNumber = computed<string>(() => formatDayNumber(props.modelValue.eventDate))

function updateSlot(index: number, slot: PollSlotInput): void {
  const next = slots.value.map((existing, i) => (i === index ? slot : existing))
  emit('update:modelValue', { ...props.modelValue, slots: next })
}

function removeSlot(index: number): void {
  const next = slots.value.filter((_, i) => i !== index)
  emit('update:modelValue', { ...props.modelValue, slots: next })
}

function addSlot(): void {
  const next: PollSlotInput[] = [
    ...slots.value,
    { startTime: '18:00', endTime: '20:00', isAllDay: false },
  ]
  emit('update:modelValue', { ...props.modelValue, slots: next })
}

const noSlots = computed<boolean>(() => props.showErrors === true && slots.value.length === 0)
</script>

<template>
  <div class="rounded-xl border border-line bg-canvas p-4">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="grid h-10 w-10 place-items-center rounded-lg bg-surface2 ring-1 ring-line">
          <span class="num text-base font-semibold leading-none text-pollen">{{ dayNumber }}</span>
        </span>
        <div>
          <p class="num text-sm font-semibold">{{ dateLabel }}</p>
          <p class="text-xs text-mute">
            <span class="num">{{ slots.length }}</span> slot{{ slots.length === 1 ? '' : 's' }}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="touch-target inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-dim transition hover:text-coral"
        aria-label="Remove date"
        @click="emit('remove')"
      >
        ✕
      </button>
    </div>

    <div class="space-y-2 pl-13">
      <SlotRow
        v-for="(slot, index) in slots"
        :key="index"
        :model-value="slot"
        :show-errors="showErrors"
        @update:model-value="updateSlot(index, $event)"
        @remove="removeSlot(index)"
      />

      <p v-if="noSlots" class="flex items-center gap-1.5 text-xs text-coral">
        <span aria-hidden="true">⚠</span>Add at least one time slot for this date.
      </p>

      <button
        type="button"
        class="touch-target inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-dim transition hover:text-pollen"
        @click="addSlot"
      >
        + Add slot
      </button>
    </div>
  </div>
</template>
