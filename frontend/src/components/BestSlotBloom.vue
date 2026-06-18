<script setup lang="ts">
import { formatDate, formatSlotRange, formatCloseLabel } from '@/lib/utils/timezone'
import type { BestSlot, SlotMeta, PollStatus } from '@/lib/api/types'

/**
 * Large "best slot · in bloom" card with the complete-poll CTA. Ports the
 * `best-slot-badge.html` Variant 1 bloom card + the bloom panel in `poll-manage.html`.
 *
 * The winning slot's glow (`bloom-bg`) lives on exactly one element — this root `<section>` — so the
 * results table can carry the only *other* bloom highlight without doubling up. When there is no
 * winner yet (`best`/`meta` null) the card collapses to a calm empty hint with no CTA.
 */
defineProps<{
  best: BestSlot | null
  meta: SlotMeta | null
  timezone: string
  status: PollStatus
  completedAt: string | null
  available: number
  participantCount: number
  completing?: boolean
}>()

const emit = defineEmits<{ complete: [] }>()
</script>

<template>
  <!-- Empty hint: no responses yet, so nothing has bloomed and there is no slot to complete. -->
  <section
    v-if="best === null || meta === null"
    data-testid="best-slot-bloom"
    class="rounded-2xl border border-line bg-surface p-6 text-dim shadow-card"
  >
    <p class="text-sm">No responses yet — the best slot will bloom here.</p>
  </section>

  <section
    v-else
    data-testid="best-slot-bloom"
    class="bloom bloom-bg relative overflow-hidden rounded-2xl border border-pollen/40 bg-surface p-4 sm:p-6 lg:p-8 shadow-card"
  >
    <!-- Header: in-bloom pill + score -->
    <div class="flex items-start justify-between gap-4">
      <span
        class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
        >✦ In bloom</span
      >
      <div class="text-right">
        <div class="font-display text-4xl sm:text-5xl font-bold leading-none text-pollen">
          {{ best.score }}
        </div>
        <p class="pt-1 text-xs uppercase tracking-widest text-mute">Score</p>
      </div>
    </div>

    <!-- Date + slot range / label -->
    <div class="mt-5">
      <h3 class="font-display text-2xl md:text-3xl font-semibold tracking-tight text-moonlight">
        {{ formatDate(meta.date, timezone) }}
      </h3>
      <p class="mt-1 font-display text-base font-medium text-dim">
        {{ formatSlotRange(meta.slot, timezone)
        }}<template v-if="meta.slot.label"> · {{ meta.slot.label }}</template>
      </p>
    </div>

    <!-- Availability grains + timezone -->
    <div class="mt-5 flex items-center gap-3 border-t border-line/70 pt-4">
      <span class="flex flex-wrap items-center gap-1" aria-hidden="true">
        <span v-for="n in available" :key="n" class="pollen-dot inline-block h-3.5 w-3.5"></span>
      </span>
      <p class="font-display text-sm font-medium text-moonlight">
        {{ available }} of {{ participantCount }} available
      </p>
      <span class="ml-auto text-sm text-mute">{{ timezone }}</span>
    </div>

    <!-- Action area -->
    <div class="mt-5 border-t border-line/70 pt-4">
      <template v-if="status === 'open'">
        <button
          type="button"
          data-testid="complete-btn"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-pollen px-4 py-2.5 font-medium text-canvas shadow-glow transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-pollen/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="completing"
          @click="emit('complete')"
        >
          {{ completing ? 'Completing…' : '✦ Complete poll' }}
        </button>
        <p class="mt-2 text-xs text-mute">
          Confirm {{ formatDate(meta.date, timezone)
          }}<template v-if="meta.slot.label"> · {{ meta.slot.label }}</template> as the final time
        </p>
      </template>

      <template v-else>
        <p class="font-display text-sm font-medium text-mint">✓ Completed</p>
        <p v-if="completedAt" class="mt-1 text-xs text-mute">
          Completed {{ formatCloseLabel(completedAt, timezone) }}
        </p>
      </template>
    </div>
  </section>
</template>
