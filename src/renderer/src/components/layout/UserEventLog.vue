<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEventLog } from '../../composables/useEventLog'

const { entries, visibleEntries, isCollapsed, clearEvents, toggleCollapsed } = useEventLog()
const { t } = useI18n()

const errors = computed(() => entries.value.filter((entry) => entry.level === 'error').length)
const latest = computed(() => entries.value[0])

const journalTitle = computed(() => {
  return isCollapsed.value
    ? t('logger.title.collapsed', { count: entries.value.length })
    : t('logger.title.expanded')
})
</script>

<template>
  <footer class="event-log-panel" :class="{ collapsed: isCollapsed }">
    <div class="event-log-header">
      <div class="journal-summary">
        <span class="journal-dot" :class="{ error: errors > 0 }" aria-hidden="true" />
        <h2>{{ journalTitle }}</h2>
        <span v-if="errors" class="journal-errors">{{
          t('logger.errorCount', { count: errors })
        }}</span>
        <span class="journal-latest">{{ latest?.message ?? t('logger.empty') }}</span>
      </div>

      <div class="event-log-actions">
        <button
          type="button"
          class="text-button compact-button"
          :aria-expanded="!isCollapsed"
          aria-controls="event-log-list"
          @click="toggleCollapsed"
        >
          {{ isCollapsed ? t('common.actions.expand') : t('common.actions.collapse') }}
        </button>
        <button
          v-if="!isCollapsed"
          type="button"
          class="text-button compact-button"
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

    <ol v-if="!isCollapsed && visibleEntries.length > 0" id="event-log-list" class="log-list">
      <li v-for="entry in visibleEntries" :key="entry.id">
        <time>{{ new Date(entry.occurredAt).toLocaleTimeString() }}</time>
        <span :class="`log-level ${entry.level}`">{{ t(`logger.levels.${entry.level}`) }}</span>
        <div class="log-message">
          <p>{{ entry.message }}</p>
          <small v-if="entry.description">{{ entry.description }}</small>
          <small v-if="entry.deviceId">{{ t('logger.device', { id: entry.deviceId }) }}</small>
        </div>
      </li>
    </ol>
  </footer>
</template>
