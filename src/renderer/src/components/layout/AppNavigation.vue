<script setup lang="ts">
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

const items: NavigationItem[] = [
  {
    id: 'devices',
    label: 'Devices',
    description: 'Управление'
  },
  {
    id: 'profiles',
    label: 'Stream profiles',
    description: 'Профили трансляции'
  },
  {
    id: 'diagnostics',
    label: 'Settings / Diagnostics',
    description: 'Окружение и логи'
  }
]
</script>

<template>
  <header class="app-navigation">
    <div class="brand-block">
      <p class="eyebrow">Local control mode</p>
      <h1>VR Control Center</h1>
    </div>

    <nav aria-label="Application sections">
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
