<script setup lang="ts">
import { computed } from 'vue'
import SlotRow from '@/components/SlotRow.vue'
import { formatDate, formatDayNumber } from '@/lib/utils/timezone'
import type { PollDateInput, PollSlotInput } from '@/types/poll'

/**
 * One candidate date: a day-number chip, the formatted date label, its slot rows, and add/remove
 * actions. Like {@link SlotRow}, it owns no parent-array logic, every change emits an immutable
 * replacement of this date upward; the editor owns the date list. `showErrors` flows down to each
 * slot and also reveals the "needs at least one slot" message when the last slot was removed.
 */
const props = defineProps<{
  modelValue: PollDateInput
  timezone: string
  showErrors?: boolean
  /** Edit mode (`/polls/:id/edit`): a voted (locked) or invalidated date becomes invalidate-only —
   *  no in-place slot/date edits, no remove. Zero-vote + brand-new dates stay freely editable. */
  editMode?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [PollDateInput]; remove: [] }>()

const slots = computed<PollSlotInput[]>(() => props.modelValue.slots)

const dateLabel = computed<string>(() => formatDate(props.modelValue.eventDate, props.timezone))
const dayNumber = computed<string>(() => formatDayNumber(props.modelValue.eventDate))

/** A loaded date carrying votes (on itself or any slot), its structure is immutable, invalidate-only. */
const isLocked = computed<boolean>(
  () =>
    props.editMode === true &&
    props.modelValue.id != null &&
    (props.modelValue.hasVotes === true || props.modelValue.slots.some((s) => s.hasVotes === true)),
)
const isInvalidated = computed<boolean>(() => props.modelValue.invalidatedAt != null)
/**
 * Date-level affordances (add-slot, remove-date) are suppressed when the date is locked (voted) or
 * deactivated, a voted/invalidated date can only be invalidated/reactivated, never restructured.
 */
const dateActionsLocked = computed<boolean>(() => isLocked.value || isInvalidated.value)

/**
 * Per-slot read-only state. A slot locks individually when it carries votes, or when the WHOLE date
 * is invalidated (every slot then renders read-only). A zero-vote slot in a voted date stays freely
 * editable, only its add/remove siblings at the date level are suppressed. Keeps acceptance #2 true:
 * "zero-vote and brand-new entries stay freely editable".
 */
function slotLocked(slot: PollSlotInput): boolean {
  return isInvalidated.value || (props.editMode === true && slot.hasVotes === true)
}

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

/**
 * Invalidate / reactivate the whole date. Invalidating a date logically invalidates ALL its slots
 * (stamp the same ISO instant). Reactivating clears the date's marker AND the slot-level markers, the
 * simplest correct rule: a date and its slots come back active together (slot-level toggles made via
 * `SlotRow` are independent, but reactivating the date is a clean reset so the date is usable again).
 */
function toggleDateInvalidation(): void {
  if (isInvalidated.value) {
    emit('update:modelValue', {
      ...props.modelValue,
      invalidatedAt: null,
      slots: slots.value.map((s) => ({ ...s, invalidatedAt: null })),
    })
  } else {
    const stamp = new Date().toISOString()
    emit('update:modelValue', {
      ...props.modelValue,
      invalidatedAt: stamp,
      slots: slots.value.map((s) => ({ ...s, invalidatedAt: stamp })),
    })
  }
}

const noSlots = computed<boolean>(() => props.showErrors === true && slots.value.length === 0)
</script>

<template>
  <div
    class="rounded-xl border border-line bg-canvas p-4"
    :class="isInvalidated ? 'opacity-60' : ''"
  >
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="grid h-10 w-10 place-items-center rounded-lg bg-surface2 ring-1 ring-line">
          <span class="num text-base font-semibold leading-none text-pollen">{{ dayNumber }}</span>
        </span>
        <div>
          <p
            class="num text-sm font-semibold"
            :class="isInvalidated ? 'text-mute line-through' : ''"
          >
            {{ dateLabel }}
          </p>
          <p class="flex items-center gap-2 text-xs text-mute">
            <span
              ><span class="num">{{ slots.length }}</span> slot{{
                slots.length === 1 ? '' : 's'
              }}</span
            >
            <span
              v-if="isInvalidated"
              class="rounded-full bg-surface2 px-2 py-0.5 font-medium text-mute ring-1 ring-line"
              >Invalidated</span
            >
          </p>
        </div>
      </div>

      <!-- Edit mode, locked/invalidated date: invalidate-only (no remove). Else: the remove ✕. -->
      <button
        v-if="dateActionsLocked"
        type="button"
        class="touch-target inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
        :class="isInvalidated ? 'text-pollen hover:text-pollen/80' : 'text-dim hover:text-coral'"
        @click="toggleDateInvalidation"
      >
        {{ isInvalidated ? 'Reactivate date' : 'Invalidate date' }}
      </button>
      <button
        v-else
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
        :locked="slotLocked(slot)"
        @update:model-value="updateSlot(index, $event)"
        @remove="removeSlot(index)"
      />

      <p v-if="noSlots" class="flex items-center gap-1.5 text-xs text-coral">
        <span aria-hidden="true">⚠</span>Add at least one time slot for this date.
      </p>

      <!-- Adding slots is suppressed on a locked/invalidated date, it can only be invalidated. -->
      <button
        v-if="!dateActionsLocked"
        type="button"
        class="touch-target inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-dim transition hover:text-pollen"
        @click="addSlot"
      >
        + Add slot
      </button>
    </div>
  </div>
</template>
