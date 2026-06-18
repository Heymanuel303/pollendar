<script setup lang="ts">
// A surface panel lifted off the canvas. Optional `title` slot for a section heading.
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
    <header v-if="$slots.title" class="mb-6">
      <h2 class="font-display text-2xl font-semibold tracking-tight">
        <slot name="title" />
      </h2>
    </header>
    <slot />
  </section>
</template>
