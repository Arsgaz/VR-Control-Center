<script setup lang="ts">
import HeadsetControl from './components/HeadsetControl.vue'
</script>

<template>
  <main class="app-shell">
    <section class="intro-panel">
      <div class="heading-group">
        <p class="eyebrow">Local control mode</p>
        <h1>Arena Control Center</h1>
        <p class="subtitle">Single headset ADB and scrcpy workflow</p>
      </div>

      <HeadsetControl />
    </section>
  </main>
</template>
