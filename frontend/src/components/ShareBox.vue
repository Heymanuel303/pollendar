<script setup lang="ts">
import { computed } from 'vue'
import BestSlotBadge from '@/components/BestSlotBadge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { buildFullInviteMessage } from '@/lib/invite'
import { formatCloseLabel } from '@/lib/utils/timezone'
import type { BestSlot, Poll, SlotMeta } from '@/lib/api/types'

/**
 * Creator-facing share panel: surfaces the public link and the full DESIGN.md §7 invite message,
 * each with its own copy-to-clipboard control, plus a footer badge for the current winning slot.
 * It owns no fetching — the share URL, poll, and best-slot data are passed in. The "Please reply
 * before …" line is added by `buildFullInviteMessage` only when the poll has a close time.
 */
const props = defineProps<{
  poll: Poll
  shareUrl: string
  best: BestSlot | null
  bestMeta: SlotMeta | null
}>()

const inviteMessage = computed<string>(() =>
  buildFullInviteMessage({
    title: props.poll.title,
    description: props.poll.description,
    shareUrl: props.shareUrl,
    closesAtHuman: props.poll.closesAt
      ? formatCloseLabel(props.poll.closesAt, props.poll.timezone)
      : null,
  }),
)
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <div>
      <h2 class="font-display text-lg font-semibold tracking-tight">Share</h2>
      <p class="mt-1 text-sm text-dim">Find the time everyone can make.</p>
    </div>

    <div class="mt-5">
      <label class="text-xs uppercase tracking-widest text-mute">Public link</label>
      <div class="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          data-testid="share-link"
          readonly
          :value="shareUrl"
          class="w-full min-w-0 flex-1 truncate rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-dim focus:outline-none"
        />
        <CopyButton :value="shareUrl" variant="primary" class="w-full whitespace-nowrap sm:w-auto"
          >Copy link</CopyButton
        >
      </div>
    </div>

    <div class="mt-5">
      <label class="text-xs uppercase tracking-widest text-mute">Invite message</label>
      <p
        data-testid="invite-message"
        class="mt-2 mb-2 whitespace-pre-line rounded-xl border border-line bg-canvas p-4 text-sm leading-relaxed text-dim"
      >
        {{ inviteMessage }}
      </p>
      <CopyButton :value="inviteMessage" variant="secondary">Copy invite message</CopyButton>
    </div>

    <div class="mt-5">
      <BestSlotBadge :best="best" :meta="bestMeta" :timezone="poll.timezone" />
    </div>
  </section>
</template>
