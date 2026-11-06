<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{ labelledby: string; wide?: boolean; busy?: boolean }>(), {
  wide: false,
  busy: false
})
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
let previousFocus: HTMLElement | null = null
onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})
onUnmounted(() => {
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="app-dialog"
      :class="{ wide }"
      :aria-labelledby="labelledby"
      :aria-busy="busy"
      @cancel.prevent="!busy && emit('close')"
      @click="
        (event) => {
          if (event.target === dialog && !busy) emit('close')
        }
      "
    >
      <slot />
    </dialog>
  </Teleport>
</template>
