<script setup lang="ts">
import { onMounted } from 'vue'
import { useHeadsetController } from '../../composables/useHeadsetController'

const headset = useHeadsetController()

onMounted(() => {
  void headset.initialize()
})
</script>

<template>
  <section class="section-content" aria-labelledby="devices-title">
    <div class="section-heading">
      <p class="section-label">Devices / Управление</p>
      <h2 id="devices-title">Test headset</h2>
      <p class="muted-text">
        One local headset card is used for the first workflow and can later become a reusable device card.
      </p>
    </div>

    <section class="info-card device-card" aria-label="Test headset controls">
      <div class="card-header">
        <div>
          <p class="section-label">Device</p>
          <h3>Test headset</h3>
        </div>
      </div>

      <div class="form-grid">
        <label>
          <span>Address IP:port</span>
          <input
            v-model="headset.address.value"
            type="text"
            autocomplete="off"
            placeholder="192.168.1.100:5555"
          />
        </label>

        <label>
          <span>Crop</span>
          <input v-model="headset.crop.value" type="text" autocomplete="off" placeholder="Empty" />
        </label>

        <label class="toggle-row">
          <input v-model="headset.noAudio.value" type="checkbox" />
          <span>No audio</span>
        </label>
      </div>

      <div class="state-grid">
        <div class="state-box">
          <p class="section-label">ADB connection</p>
          <strong :class="`state-${headset.adbConnectionState.value}`">
            {{ headset.adbConnectionState.value }}
          </strong>
          <span>{{ headset.adbConnectionMessage.value }}</span>
        </div>

        <div class="state-box">
          <p class="section-label">scrcpy stream</p>
          <strong :class="`state-${headset.scrcpyStatus.value?.state ?? 'stopped'}`">
            {{ headset.scrcpyStatus.value?.state ?? 'stopped' }}
          </strong>
          <span>{{ headset.scrcpyStatus.value?.message ?? 'scrcpy is not running' }}</span>
        </div>
      </div>

      <div class="actions-grid">
        <button
          type="button"
          class="secondary-button"
          :disabled="headset.isBusy.value || !headset.isAdbAvailable.value"
          @click="headset.refreshDevices"
        >
          {{ headset.operation.value === 'devices' ? 'Refreshing...' : 'Refresh devices' }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="headset.isBusy.value || !headset.isAdbAvailable.value"
          @click="headset.connectDevice"
        >
          {{ headset.operation.value === 'connect' ? 'Connecting...' : 'Connect' }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="headset.isBusy.value || !headset.isAdbAvailable.value"
          @click="headset.disconnectDevice"
        >
          {{ headset.operation.value === 'disconnect' ? 'Disconnecting...' : 'Disconnect' }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="
            headset.isBusy.value ||
            !headset.isScrcpyAvailable.value ||
            headset.isScrcpyRunning.value
          "
          @click="headset.startScrcpy"
        >
          {{ headset.operation.value === 'startScrcpy' ? 'Starting...' : 'Start stream' }}
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="headset.isBusy.value || !headset.isScrcpyRunning.value"
          @click="headset.stopScrcpy"
        >
          {{ headset.operation.value === 'stopScrcpy' ? 'Stopping...' : 'Stop stream' }}
        </button>
      </div>

      <div class="devices-list">
        <p class="section-label">ADB devices</p>
        <p v-if="headset.devices.value.length === 0" class="muted-text">No ADB devices found.</p>
        <ul v-else>
          <li v-for="device in headset.devices.value" :key="device.serial">
            <span>{{ device.serial }}</span>
            <span>{{ device.rawState }}</span>
          </li>
        </ul>
      </div>
    </section>
  </section>
</template>
