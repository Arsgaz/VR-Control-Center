<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeviceConfig } from '../../../../shared/contracts/config.contracts'

const props = defineProps<{
  device: DeviceConfig
}>()

defineEmits<{
  close: []
}>()

const query = ref('')
const { t } = useI18n()
const games = computed<string[]>(() => {
  void props.device
  return []
})
</script>

<template>
  <div class="modal-backdrop" role="presentation" @click.self="$emit('close')">
    <section class="modal-panel" aria-labelledby="launch-game-title">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('devices.launchGame.title') }}</p>
          <h3 id="launch-game-title">{{ device.name }}</h3>
        </div>
      </div>

      <label class="modal-search">
        <span>{{ t('devices.launchGame.search') }}</span>
        <input
          v-model="query"
          type="text"
          autocomplete="off"
          :placeholder="t('devices.launchGame.searchPlaceholder')"
        />
      </label>

      <div class="empty-list-state">
        <p class="section-label">{{ t('devices.launchGame.emptyTitle') }}</p>
        <p class="muted-text">
          {{ t('devices.launchGame.emptyDescription') }}
        </p>
      </div>

      <ul v-if="games.length > 0" class="game-list">
        <li v-for="game in games" :key="game">{{ game }}</li>
      </ul>

      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="$emit('close')">
          {{ t('common.actions.close') }}
        </button>
      </div>
    </section>
  </div>
</template>
