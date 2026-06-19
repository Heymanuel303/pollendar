<script setup lang="ts">
/**
 * Reusable empty-state panel: a dashed-border card with an icon, title, body, and an optional CTA.
 * Purely presentational, it knows nothing about routes. The `icon` slot defaults to the `＋` glyph;
 * the caller fills the `cta` slot with whatever action fits the screen (the dashboard passes a
 * "Create a poll" link to `/polls/new`).
 */
defineProps<{ title: string; body: string }>()
</script>

<template>
  <section
    class="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/40 p-8 text-center"
  >
    <span
      class="grid h-11 w-11 place-items-center rounded-2xl bg-surface2 text-pollen ring-1 ring-line"
    >
      <slot name="icon"><span class="font-display text-xl">＋</span></slot>
    </span>
    <p class="mt-3 font-display font-semibold text-moonlight">{{ title }}</p>
    <p class="mt-1 text-sm text-dim">{{ body }}</p>
    <div v-if="$slots.cta" class="mt-4">
      <slot name="cta" />
    </div>
  </section>
</template>
