<script setup lang="ts">
import { computed } from 'vue'
import DateCard from '@/components/DateCard.vue'
import { nextCandidateDate } from '@/lib/utils/timezone'
import type { PollDateInput } from '@/types/poll'

/**
 * The "Candidate times" section: a reactive "N dates · M slots" badge, a list of {@link DateCard}s,
 * and an "+ Add date" button. Fully controlled — it mutates nothing in place; every add/remove of a
 * date or slot bubbles up as an immutable `update:modelValue`, so the parent view owns the array and
 * this component stays a pure function of its props. `showErrors` flows down to each card/slot.
 */
const props = defineProps<{
  modelValue: PollDateInput[]
  timezone: string
  showErrors?: boolean
  /** Edit mode (`/polls/:id/edit`): forwarded to each {@link DateCard} so voted dates lock to
   *  invalidate-only. Adding brand-new dates stays available (see `addDate`). Absent ⇒ create mode. */
  editMode?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [PollDateInput[]] }>()

const dates = computed<PollDateInput[]>(() => props.modelValue)
const totalSlots = computed<number>(() =>
  props.modelValue.reduce((sum, date) => sum + date.slots.length, 0),
)
const noDates = computed<boolean>(() => props.showErrors === true && props.modelValue.length === 0)

function updateDate(index: number, date: PollDateInput): void {
  emit(
    'update:modelValue',
    props.modelValue.map((existing, i) => (i === index ? date : existing)),
  )
}

function removeDate(index: number): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

function addDate(): void {
  const last = props.modelValue[props.modelValue.length - 1]
  const eventDate = nextCandidateDate(last?.eventDate)
  emit('update:modelValue', [
    ...props.modelValue,
    { eventDate, slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }] },
  ])
}
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <h2 class="font-display text-lg font-semibold">Candidate times</h2>
        <p class="mt-0.5 text-sm text-dim">Add the dates and slots people can choose from.</p>
      </div>
      <span
        class="shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-xs font-medium text-dim ring-1 ring-line"
      >
        <span class="num">{{ dates.length }}</span> date{{ dates.length === 1 ? '' : 's' }} ·
        <span class="num">{{ totalSlots }}</span> slot{{ totalSlots === 1 ? '' : 's' }}
      </span>
    </div>

    <div class="space-y-3">
      <DateCard
        v-for="(date, index) in dates"
        :key="index"
        :model-value="date"
        :timezone="timezone"
        :show-errors="showErrors"
        :edit-mode="editMode"
        @update:model-value="updateDate(index, $event)"
        @remove="removeDate(index)"
      />

      <p v-if="noDates" class="flex items-center gap-1.5 text-sm text-coral">
        <span aria-hidden="true">⚠</span>Add at least one candidate date.
      </p>
    </div>

    <button
      type="button"
      class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas px-4 py-3 font-medium text-dim transition hover:border-pollen/40 hover:text-pollen"
      @click="addDate"
    >
      <span class="text-lg leading-none text-pollen">+</span> Add date
    </button>
  </section>
</template>
