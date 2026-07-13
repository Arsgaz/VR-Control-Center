<script setup lang="ts">
import { onMounted } from 'vue'
import { useHeadsetController } from '../../composables/useHeadsetController'

const headset = useHeadsetController()

onMounted(() => {
  void headset.initialize()
})
</script>

<template>
  <section class="section-content" aria-labelledby="diagnostics-title">
    <div class="section-heading">
      <p class="section-label">Settings / Diagnostics</p>
      <h2 id="diagnostics-title">Environment and logs</h2>
      <p class="muted-text">
        Technical details for local setup diagnostics. Main-process logs are written to the standard Electron log directory.
      </p>
    </div>

    <section class="info-card environment-card" aria-labelledby="environment-title">
      <div class="card-header">
        <div>
          <p class="section-label">Environment</p>
          <h3 id="environment-title">Local tools</h3>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="headset.isBusy.value"
          @click="headset.checkEnvironment"
        >
          {{ headset.operation.value === 'environment' ? 'Checking...' : 'Check environment' }}
        </button>
      </div>

      <div class="tool-grid">
        <article class="tool-tile">
          <span class="status-pill" :class="headset.environment.value?.adb.available ? 'ok' : 'bad'">
            {{ headset.environment.value?.adb.available ? 'Available' : 'Unavailable' }}
          </span>
          <h3>ADB</h3>
          <p>
            {{
              headset.environment.value?.adb.version ??
              headset.environment.value?.adb.message ??
              'Not checked yet'
            }}
          </p>
        </article>

        <article class="tool-tile">
          <span
            class="status-pill"
            :class="headset.environment.value?.scrcpy.available ? 'ok' : 'bad'"
          >
            {{ headset.environment.value?.scrcpy.available ? 'Available' : 'Unavailable' }}
          </span>
          <h3>scrcpy</h3>
          <p>
            {{
              headset.environment.value?.scrcpy.version ??
              headset.environment.value?.scrcpy.message ??
              'Not checked yet'
            }}
          </p>
        </article>
      </div>
    </section>

    <section class="info-card">
      <div class="card-header">
        <div>
          <p class="section-label">Application</p>
          <h3>Runtime</h3>
        </div>
      </div>

      <dl class="details-grid">
        <div>
          <dt>Version</dt>
          <dd>{{ headset.appInfo.value?.appVersion ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd>{{ headset.appInfo.value?.platform ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Architecture</dt>
          <dd>{{ headset.appInfo.value?.arch ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Electron</dt>
          <dd>{{ headset.appInfo.value?.electronVersion ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Node.js</dt>
          <dd>{{ headset.appInfo.value?.nodeVersion ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Log directory</dt>
          <dd>{{ headset.technicalLogInfo.value?.directory ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Log file</dt>
          <dd>{{ headset.technicalLogInfo.value?.file ?? 'Unknown' }}</dd>
        </div>
      </dl>
    </section>
  </section>
</template>
