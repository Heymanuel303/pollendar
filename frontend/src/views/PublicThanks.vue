<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePublicPollStore } from '@/stores/publicPollStore'
import CopyButton from '@/components/ui/CopyButton.vue'
import { buildInviteMessage, buildShareUrl } from '@/lib/invite'
import { getParticipantToken } from '@/lib/participantToken'
import { formatDate } from '@/lib/utils/timezone'

/**
 * Post-submit confirmation (`/p/:publicToken/done`): a bloom hero, the live best-slot card (fetched
 * from `GET /results`, separately from submit), and the share actions. Thin, the store owns the
 * fetches; this view only formats and lays them out.
 */
const route = useRoute()
const store = usePublicPollStore()
const { poll, results } = storeToRefs(store)

const token = computed<string>(() => String(route.params.publicToken ?? ''))
/** The just-submitted name, passed via the navigation query; omitted gracefully on a cold load. */
const name = computed<string | null>(() =>
  typeof route.query.name === 'string' && route.query.name !== '' ? route.query.name : null,
)

onMounted(async () => {
  // One cold-load orchestrator: title/timezone for a cold share-link arrival + results for the bloom.
  await store.loadDetail(token.value)
})

const shareUrl = computed<string>(() => buildShareUrl(token.value))
const inviteMessage = computed<string>(() =>
  buildInviteMessage(poll.value?.title ?? '', shareUrl.value),
)

/** Live best slot, or `null` when the poll has no slots / results haven't loaded. */
const best = computed(() => results.value?.best ?? null)
const bestDate = computed<string>(() =>
  best.value ? formatDate(best.value.date, poll.value?.timezone) : '',
)
const bestHeading = computed<string>(() =>
  best.value ? (best.value.label ? `${bestDate.value} · ${best.value.label}` : bestDate.value) : '',
)

/** "Edit my response" only makes sense once we've stored this participant's edit token for the poll. */
const hasEditToken = computed<boolean>(() => getParticipantToken(token.value) !== null)
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-line/70 bg-canvas/60 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-2xl items-center justify-center px-6">
        <span class="flex items-center gap-2.5">
          <span
            class="grid h-8 w-8 place-items-center rounded-xl bg-pollen font-display text-base font-bold text-canvas shadow-glow"
            >P</span
          >
          <span class="font-display text-lg font-semibold tracking-tight">Pollendar</span>
        </span>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <!-- Confirmation hero -->
      <div class="text-center">
        <div
          class="bloom-bg mx-auto grid h-20 w-20 place-items-center rounded-full bg-pollen/15 shadow-glow"
        >
          <span class="font-display text-3xl text-pollen">✦</span>
        </div>
        <h1 class="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          You're in!
        </h1>
        <p class="mt-3 text-dim">
          <template v-if="name">Thanks {{ name }}, your availability is saved.</template>
          <template v-else>Your availability is saved.</template>
        </p>
        <div
          v-if="poll"
          class="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-dim"
        >
          <span class="pollen-dot inline-block h-2 w-2" aria-hidden="true"></span>
          <span class="num font-medium text-moonlight">{{ poll.title }}</span>
          <span class="text-mute">· {{ poll.timezone }}</span>
        </div>
      </div>

      <!-- Best slot bloom (hidden when there are no slots / no results yet) -->
      <section
        v-if="best"
        class="bloom-bg mt-10 rounded-2xl border border-pollen/30 bg-surface p-6 shadow-glow"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs uppercase tracking-widest text-mute">Top pick so far</p>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
            >✦ Top pick</span
          >
        </div>
        <div class="mt-3 flex items-end justify-between gap-4">
          <div>
            <p class="num text-2xl font-semibold tracking-tight">{{ bestHeading }}</p>
          </div>
          <div class="text-right">
            <p class="num text-sm font-medium text-pollen">score {{ best.score }}</p>
          </div>
        </div>
        <p class="mt-4 border-t border-line/60 pt-4 text-sm text-dim">
          This can still change as more people respond.
        </p>
      </section>

      <!-- Share actions -->
      <section class="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 class="font-display text-base font-semibold">Help find the time everyone can make</h2>
        <p class="mt-1 text-sm text-dim">Pass it along. It takes about a minute.</p>
        <div class="mt-4 flex flex-col gap-3 sm:flex-row">
          <CopyButton :value="shareUrl" variant="primary">
            <span aria-hidden="true">🔗</span> Copy link
          </CopyButton>
          <CopyButton :value="inviteMessage" variant="secondary">
            <span aria-hidden="true">✉</span> Copy invite
          </CopyButton>
        </div>
        <div
          class="mt-4 truncate rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-dim"
        >
          {{ shareUrl }}
        </div>
      </section>

      <!-- Edit response (only when we have this participant's edit token) -->
      <div v-if="hasEditToken" class="mt-6 text-center">
        <RouterLink
          :to="`/p/${token}`"
          class="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-medium text-dim transition hover:text-moonlight"
        >
          <span aria-hidden="true">✎</span> Edit my response
        </RouterLink>
      </div>

      <footer class="mt-12 border-t border-line/60 pt-6 text-center text-sm text-mute">
        <p>The organizer confirms the final time. We'll email you if you left an address.</p>
        <p class="mt-3 text-xs">pollendar.app</p>
      </footer>
    </main>
  </div>
</template>
