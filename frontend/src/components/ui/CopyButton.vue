<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * Copy-to-clipboard primitive: copies `value` and flips its label to "Copied" for ~1.5s. Prefers the
 * async Clipboard API and falls back to a hidden `<textarea>` + `document.execCommand('copy')` where
 * it is unavailable (older/insecure contexts). The idle label is provided via the default slot so
 * callers can include an icon; the "Copied" state replaces it.
 */
const props = withDefaults(defineProps<{ value: string; variant?: 'primary' | 'secondary' }>(), {
  variant: 'primary',
})

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  const ok = await writeToClipboard(props.value)
  if (!ok) return
  copied.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied / insecure context — fall through to the legacy path.
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const base =
  'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition active:translate-y-px'

const variantClass = computed<string>(() =>
  props.variant === 'primary'
    ? 'bg-pollen text-canvas shadow-glow hover:brightness-110'
    : 'border border-line bg-surface text-moonlight hover:bg-surface2',
)
</script>

<template>
  <button
    type="button"
    :class="[base, variantClass]"
    :aria-live="copied ? 'polite' : undefined"
    @click="copy"
  >
    <template v-if="copied"><span aria-hidden="true">✓</span> Copied</template>
    <slot v-else />
  </button>
</template>
