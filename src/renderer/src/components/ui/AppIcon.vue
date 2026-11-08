<script setup lang="ts">
import { iconPaths, type IconName } from './icon-paths'
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 })
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    :viewBox="name === 'headset' ? '50 0 212 100' : '0 0 24 24'"
    :fill="name === 'headset' ? 'currentColor' : 'none'"
    :stroke="name === 'headset' ? 'none' : 'currentColor'"
    :stroke-width="name === 'more' ? 3.4 : 1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(path, index) in iconPaths[name]" :key="index" :d="path" />
  </svg>
</template>

<style scoped>
.app-icon {
  flex: 0 0 auto;
  display: block;
  pointer-events: none;
}
</style>
