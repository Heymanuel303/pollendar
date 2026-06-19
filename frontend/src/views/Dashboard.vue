<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePollStore, type Poll } from '@/stores/pollStore'
import PollCard from '@/components/PollCard.vue'
import EmptyState from '@/components/EmptyState.vue'

// Thin view: fetching lives in the store, presentation in PollCard/EmptyState. This view only kicks
// off list() on mount and switches between the error / loading / empty / grid states. The app shell
// (App.vue) already provides the nav + centered <main>, so this renders the dashboard content only.
const pollStore = usePollStore()
const { polls, loading, listError } = storeToRefs(pollStore)

onMounted(() => pollStore.list())

// The share box (and GET /api/polls/:id/invite-message) lands in a later phase, acknowledge the
// emit so the card's "Share" affordance is wired without doing anything yet.
function onShare(poll: Poll): void {
  console.debug('[dashboard] share requested for poll', poll.id)
}
</script>

<template>
  <div class="py-2">
    <!-- Page header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your polls</h1>
        <p class="mt-1.5 text-dim">
          Find the time everyone can make, track every gathering in one place.
        </p>
      </div>
      <RouterLink
        to="/polls/new"
        class="inline-flex items-center justify-center gap-2 rounded-xl bg-pollen px-4 py-2.5 font-medium text-canvas shadow-glow transition hover:brightness-110 active:translate-y-px"
      >
        <span class="font-display text-lg leading-none">＋</span> New poll
      </RouterLink>
    </div>

    <!-- Error -->
    <div v-if="listError" class="mt-16 flex flex-col items-center gap-3 text-center">
      <p class="flex items-center gap-1.5 text-sm text-coral">
        <span aria-hidden="true">⚠</span>{{ listError }}
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-moonlight transition hover:bg-surface2"
        @click="pollStore.list()"
      >
        Try again
      </button>
    </div>

    <!-- Loading (first load), calm settle, no looping spinner -->
    <div
      v-else-if="loading && !polls.length"
      class="mt-16 flex animate-settle flex-col items-center gap-3 text-mute"
    >
      <span class="pollen-dot h-3 w-3" aria-hidden="true"></span>
      <p class="text-sm">Gathering your polls…</p>
    </div>

    <!-- Empty (full-width, not inside the grid) -->
    <EmptyState
      v-else-if="polls.length === 0"
      class="mt-8"
      title="New polls show up here"
      body="Start one and gather everyone's availability. Takes about a minute."
    >
      <template #cta>
        <RouterLink
          to="/polls/new"
          class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-dim transition hover:text-moonlight"
        >
          Create a poll
        </RouterLink>
      </template>
    </EmptyState>

    <!-- Grid -->
    <div v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <PollCard v-for="poll in polls" :key="poll.id" :poll="poll" @share="onShare" />
    </div>
  </div>
</template>
