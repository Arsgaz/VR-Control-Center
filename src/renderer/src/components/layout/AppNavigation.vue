<script setup lang="ts">
import oneplaceLogo from '../../assets/branding/oneplace-logo.svg'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type AppSection = 'devices' | 'teamGames' | 'profiles' | 'diagnostics'

interface NavigationItem {
  id: AppSection
  label: string
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
    label: t('devices.navigation.title')
  },
  {
    id: 'teamGames',
    label: t('teamGames.title')
  },
  {
    id: 'profiles',
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
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 25"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <polygon
            points="9.5,2 14.5,2 15.1,5 17,6.1 19.9,5.1 22.4,9.4 20.1,11.4 20.1,13.6 22.4,15.6 19.9,19.9 17,18.9 15.1,20 14.5,23 9.5,23 8.9,20 7,18.9 4.1,19.9 1.6,15.6 3.9,13.6 3.9,11.4 1.6,9.4 4.1,5.1 7,6.1 8.9,5"
          />
          <circle cx="12" cy="12.5" r="3.5" />
        </svg>
      </button>
    </div>
  </header>
</template>
