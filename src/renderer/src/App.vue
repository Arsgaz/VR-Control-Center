<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppNavigation from './components/layout/AppNavigation.vue'
import UserEventLog from './components/layout/UserEventLog.vue'
import DevicesSection from './components/sections/DevicesSection.vue'
import TeamGamesSection from './components/sections/TeamGamesSection.vue'
import DiagnosticsSection from './components/sections/DiagnosticsSection.vue'
import StreamProfilesSection from './components/sections/StreamProfilesSection.vue'
import { useHeadsetController } from './composables/useHeadsetController'

type AppSection = 'devices' | 'teamGames' | 'profiles' | 'diagnostics'

const activeSection = ref<AppSection>('devices')
const profileEditor = ref<InstanceType<typeof StreamProfilesSection> | null>(null)
const changeSection = (section: AppSection): void => {
  if (section === activeSection.value) return
  if (activeSection.value === 'profiles' && profileEditor.value?.confirmLeave() === false) return
  activeSection.value = section
}
const headset = useHeadsetController()

onMounted(() => {
  void headset.initialize()
})

onUnmounted(() => {
  headset.dispose()
})
</script>

<template>
  <main class="app-shell" :class="{ 'mac-titlebar': headset.appInfo.value?.platform === 'darwin' }">
    <AppNavigation :active-section="activeSection" @change="changeSection" />

    <section class="active-section" tabindex="-1">
      <DevicesSection v-if="activeSection === 'devices'" @settings="changeSection('diagnostics')" />
      <TeamGamesSection v-else-if="activeSection === 'teamGames'" />
      <StreamProfilesSection v-else-if="activeSection === 'profiles'" ref="profileEditor" />
      <DiagnosticsSection v-else />
    </section>

    <UserEventLog />
  </main>
</template>
