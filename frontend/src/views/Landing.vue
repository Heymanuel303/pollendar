<script setup lang="ts">
// Pitch page (`/`). The brand header lives in the global AppNav; this view owns the hero, the
// EmailGate (the sign-in affordance), the reassurance row, and a static constellation preview.
import EmailGate from '@/components/EmailGate.vue'

type Cell = 'yes' | 'maybe' | 'no'

// Static illustration ported from docs/design/mockups/screens/landing.html, no live data this phase.
const previewColumns = [
  { day: 'Thu', part: 'Early' },
  { day: 'Thu', part: 'Late' },
  { day: 'Fri', part: 'All day' },
  { day: 'Sat', part: 'Evening' },
]

const previewRows: Cell[][] = [
  ['yes', 'yes', 'maybe', 'no'],
  ['yes', 'maybe', 'yes', 'maybe'],
  ['yes', 'yes', 'no', 'no'],
  ['yes', 'no', 'maybe', 'yes'],
  ['yes', 'yes', 'yes', 'no'],
]
</script>

<template>
  <section class="grid items-center gap-10 py-8 sm:gap-14 sm:py-10 lg:grid-cols-2 lg:py-16">
    <!-- Copy + EmailGate -->
    <div>
      <p class="text-xs uppercase tracking-widest text-mute">Availability polling, in bloom</p>
      <h1
        class="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
      >
        Find the time everyone can make.
      </h1>
      <p class="mt-5 max-w-xl text-lg leading-relaxed text-dim">
        Pollendar gathers everyone's availability like pollen, and the best time blooms on its own.
      </p>

      <div class="mt-8 max-w-md">
        <EmailGate />
      </div>

      <div class="mt-7 flex items-center gap-3 text-sm text-mute">
        <span class="inline-flex items-center gap-1.5">
          <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
          <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
          <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
        </span>
        <span>Takes about a minute.</span>
      </div>
    </div>

    <!-- Decorative constellation preview, illustrative only, no live data this phase. -->
    <div class="relative hidden lg:block">
      <div class="bloom-bg absolute -inset-6 -z-10 rounded-3xl" aria-hidden="true"></div>
      <section
        class="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"
        aria-hidden="true"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-display text-lg font-semibold tracking-tight">Team dinner</h2>
            <p class="text-sm text-mute">Europe/Brussels · gathering responses</p>
          </div>
          <span
            class="rounded-full bg-pollen/15 px-2.5 py-1 text-xs font-medium text-pollen ring-1 ring-pollen/30"
            >Open</span
          >
        </div>

        <div class="mt-6 overflow-hidden rounded-xl border border-line bg-canvas p-4">
          <div class="grid grid-cols-4 gap-3">
            <div v-for="col in previewColumns" :key="col.day + col.part" class="text-center">
              <p class="num text-xs font-semibold text-moonlight">{{ col.day }}</p>
              <p class="text-[10px] uppercase tracking-widest text-mute">{{ col.part }}</p>
            </div>

            <template v-for="(row, r) in previewRows" :key="r">
              <div
                v-for="(cell, c) in row"
                :key="`${r}-${c}`"
                class="flex justify-center rounded-lg py-1"
                :class="{ bloom: c === 0 }"
              >
                <span v-if="cell === 'yes'" class="pollen-dot inline-block h-3 w-3"></span>
                <span
                  v-else
                  class="inline-block h-3 w-3 rounded-full"
                  :class="cell === 'maybe' ? 'bg-maybe/70' : 'bg-no'"
                ></span>
              </div>
            </template>
          </div>
        </div>

        <div
          class="bloom-bg mt-5 flex items-center justify-between rounded-xl border border-pollen/40 bg-surface2 p-4 shadow-glow"
        >
          <div>
            <p class="num text-sm font-semibold text-moonlight">Thu Jun 26 · Early</p>
            <p class="text-xs text-dim">18:00–20:00 · <span class="num">5</span> yes</p>
          </div>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
            >✦ Top pick</span
          >
        </div>
      </section>
    </div>
  </section>
</template>
