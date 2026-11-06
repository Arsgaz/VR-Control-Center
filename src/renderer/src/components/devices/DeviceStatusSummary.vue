<script setup lang="ts">
defineProps<{
  label: string
  value: string
  tone?: 'neutral' | 'ok' | 'warning' | 'error'
}>()
</script>

<template>
  <span class="operator-status" :class="tone ?? 'neutral'">
    <span class="status-label">{{ label }}</span>
    <strong :title="value">{{ value }}</strong>
  </span>
</template>
