<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEventLog } from '../../composables/useEventLog'

const { entries, visibleEntries, isCollapsed, clearEvents, toggleCollapsed } = useEventLog()
const { t } = useI18n()

const journalTitle = computed(() => {
  return isCollapsed.value
    ? t('logger.title.collapsed', { count: entries.value.length })
    : t('logger.title.expanded')
})
</script>

<template>
  <footer class="event-log-panel" :class="{ collapsed: isCollapsed }">
    <div class="event-log-header">
      <div>
        <p class="section-label">{{ t('logger.title.label') }}</p>
        <h2>{{ journalTitle }}</h2>
      </div>

      <div class="event-log-actions">
        <button type="button" class="secondary-button compact-button" @click="toggleCollapsed">
          {{ isCollapsed ? t('common.actions.expand') : t('common.actions.collapse') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="entries.length === 0"
          @click="clearEvents"
        >
          {{ t('common.actions.clear') }}
        </button>
      </div>
    </div>

    <p v-if="!isCollapsed && entries.length === 0" class="muted-text">
      {{ t('logger.empty') }}
    </p>

    <ol v-if="!isCollapsed && visibleEntries.length > 0" class="log-list">
      <li v-for="entry in visibleEntries" :key="entry.id">
        <time>{{ new Date(entry.occurredAt).toLocaleTimeString() }}</time>
        <span :class="`log-level ${entry.level}`">{{ entry.level }}</span>
        <div class="log-message">
          <p>{{ entry.message }}</p>
          <small v-if="entry.description">{{ entry.description }}</small>
          <small v-if="entry.deviceId">{{ t('logger.device', { id: entry.deviceId }) }}</small>
        </div>
      </li>
    </ol>
  </footer>
</template>
