<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type AppSection = 'devices' | 'profiles' | 'diagnostics'

interface NavigationItem {
  id: AppSection
  label: string
  description: string
}

defineProps<{
  activeSection: AppSection
}>()

const emit = defineEmits<{
  change: [section: AppSection]
}>()

const { t } = useI18n()

const items = computed<NavigationItem[]>(() => [
  {
    id: 'devices',
    label: t('devices.navigation.title'),
    description: t('devices.navigation.description')
  },
  {
    id: 'profiles',
    label: t('settings.navigation.profilesTitle'),
    description: t('settings.navigation.profilesDescription')
  },
  {
    id: 'diagnostics',
    label: t('settings.navigation.diagnosticsTitle'),
    description: t('settings.navigation.diagnosticsDescription')
  }
])
</script>

<template>
  <header class="app-navigation">
    <div class="brand-block">
      <p class="eyebrow">{{ t('common.app.mode') }}</p>
      <h1>{{ t('common.app.name') }}</h1>
    </div>

    <nav :aria-label="t('common.app.name')">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="nav-button"
        :class="{ active: activeSection === item.id }"
        @click="emit('change', item.id)"
      >
        <span>{{ item.label }}</span>
        <small>{{ item.description }}</small>
      </button>
    </nav>
  </header>
</template>
