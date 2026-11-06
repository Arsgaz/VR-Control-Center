<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import type { IconName } from '../ui/icon-paths'
import oneplaceLogo from '../../assets/branding/oneplace-logo.svg'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type AppSection = 'devices' | 'teamGames' | 'profiles' | 'diagnostics'

interface NavigationItem {
  id: AppSection
  label: string
  icon: IconName
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
    icon: 'headset',
    label: t('devices.navigation.title')
  },
  {
    id: 'teamGames',
    icon: 'monitor',
    label: t('teamGames.title')
  },
  {
    id: 'profiles',
    icon: 'sliders',
    label: t('settings.navigation.profilesTitle')
  }
])
</script>

<template>
  <header class="app-navigation">
    <div class="brand-block">
      <img
        class="brand-logo"
        :src="oneplaceLogo"
        alt="OnePlace — VR-арена"
        width="82"
        height="49"
      />
      <div class="brand-copy">
        <span class="brand-caption">{{ t('common.app.workspace') }}</span>
        <h1>{{ t('common.app.name') }}</h1>
      </div>
    </div>

    <div class="app-navigation-controls">
      <nav :aria-label="t('common.app.name')">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="nav-button"
          :class="{ active: activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
          @click="emit('change', item.id)"
        >
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <button
        type="button"
        class="settings-navigation-button"
        :class="{ active: activeSection === 'diagnostics' }"
        :aria-label="t('settings.navigation.diagnosticsTitle')"
        :title="t('settings.navigation.diagnosticsTitle')"
        :aria-current="activeSection === 'diagnostics' ? 'page' : undefined"
        @click="emit('change', 'diagnostics')"
      >
        <AppIcon name="settings" :size="20" />
      </button>
    </div>
  </header>
</template>
