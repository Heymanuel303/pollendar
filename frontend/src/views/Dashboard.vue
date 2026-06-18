<script setup lang="ts">
// Placeholder dashboard — the real poll list + cards are built in the dashboard phase. Exists this
// phase so the authed redirect target (`/auth/callback` → `/dashboard`) and the `requiresAuth`
// router guard have a route to resolve.
</script>

<template>
  <section class="py-16">
    <h1 class="font-display text-3xl font-semibold tracking-tight">Your polls</h1>
    <p class="mt-3 text-dim">You're signed in. The dashboard arrives in a later phase.</p>
  </section>
</template>
