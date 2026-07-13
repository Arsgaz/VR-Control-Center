<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppNavigation from './components/layout/AppNavigation.vue'
import UserEventLog from './components/layout/UserEventLog.vue'
import DevicesSection from './components/sections/DevicesSection.vue'
import DiagnosticsSection from './components/sections/DiagnosticsSection.vue'
import StreamProfilesSection from './components/sections/StreamProfilesSection.vue'
import { useHeadsetController } from './composables/useHeadsetController'

type AppSection = 'devices' | 'profiles' | 'diagnostics'

const activeSection = ref<AppSection>('devices')
const headset = useHeadsetController()

onMounted(() => {
  void headset.initialize()
})

onUnmounted(() => {
  headset.dispose()
})
</script>

<template>
  <main class="app-shell">
    <AppNavigation :active-section="activeSection" @change="activeSection = $event" />

    <section class="active-section" tabindex="-1">
      <DevicesSection v-if="activeSection === 'devices'" />
      <StreamProfilesSection v-else-if="activeSection === 'profiles'" />
      <DiagnosticsSection v-else />
    </section>

    <UserEventLog />
  </main>
</template>
