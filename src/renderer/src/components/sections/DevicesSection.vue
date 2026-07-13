<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DeviceConfig,
  DeviceConfigUpdate,
  NewDeviceConfig
} from '../../../../shared/contracts/config.contracts'
import DeviceDiagnosticsModal from '../devices/DeviceDiagnosticsModal.vue'
import DeviceCard from '../devices/DeviceCard.vue'
import DeviceFormModal from '../devices/DeviceFormModal.vue'
import LaunchGameModal from '../devices/LaunchGameModal.vue'
import {
  createEmptyDeviceOverlaySelection,
  openDiagnosticsOverlay,
  openLaunchGameOverlay
} from '../devices/device-overlay.model'
import { useHeadsetController } from '../../composables/useHeadsetController'

const headset = useHeadsetController()
const { t } = useI18n()
const isDeviceFormOpen = ref(false)
const editingDevice = ref<DeviceConfig | null>(null)
const overlaySelection = ref(createEmptyDeviceOverlaySelection())

const launchGameDevice = computed(() => {
  return (
    headset.configuredDevices.value.find(
      (device) => device.id === overlaySelection.value.launchGameDeviceId
    ) ?? null
  )
})

const diagnosticsDevice = computed(() => {
  return (
    headset.configuredDevices.value.find(
      (device) => device.id === overlaySelection.value.diagnosticsDeviceId
    ) ?? null
  )
})

const openCreateForm = (): void => {
  editingDevice.value = null
  isDeviceFormOpen.value = true
}

const openEditForm = (device: DeviceConfig): void => {
  editingDevice.value = device
  isDeviceFormOpen.value = true
}

const closeDeviceForm = (): void => {
  isDeviceFormOpen.value = false
  editingDevice.value = null
}

const createDevice = async (device: NewDeviceConfig): Promise<void> => {
  const saved = await headset.addDevice(device)
  if (saved) {
    closeDeviceForm()
  }
}

const updateDevice = async (id: string, changes: DeviceConfigUpdate): Promise<void> => {
  const saved = await headset.updateDevice(id, changes)
  if (saved) {
    closeDeviceForm()
  }
}

const deleteDevice = async (device: DeviceConfig): Promise<void> => {
  const confirmed = window.confirm(t('dialogs.delete.confirm', { name: device.name }))
  if (!confirmed) {
    return
  }

  const deleted = await headset.deleteDevice(device)
  if (deleted) {
    closeDeviceForm()
  }
}

const openLaunchGame = (device: DeviceConfig): void => {
  overlaySelection.value = openLaunchGameOverlay(overlaySelection.value, device.id)
}

const openDiagnostics = (device: DeviceConfig): void => {
  overlaySelection.value = openDiagnosticsOverlay(overlaySelection.value, device.id)
}

const closeLaunchGame = (): void => {
  overlaySelection.value = {
    ...overlaySelection.value,
    launchGameDeviceId: null
  }
}

const closeDiagnostics = (): void => {
  overlaySelection.value = {
    ...overlaySelection.value,
    diagnosticsDeviceId: null
  }
}
</script>

<template>
  <section class="section-content devices-section" aria-labelledby="devices-title">
    <div class="section-heading section-heading-row">
      <div>
        <p class="section-label">{{ t('devices.section.label') }}</p>
        <h2 id="devices-title">{{ t('devices.section.title') }}</h2>
        <p class="muted-text">
          {{ t('devices.section.description') }}
        </p>
      </div>

      <div class="section-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="headset.isBusy.value || !headset.isAdbAvailable.value"
          @click="headset.refreshDevices"
        >
          {{
            headset.operation.value === 'devices'
              ? t('devices.actions.refreshing')
              : t('devices.actions.refreshAdbDevices')
          }}
        </button>
        <button type="button" class="primary-button" @click="openCreateForm">
          {{ t('devices.actions.addDevice') }}
        </button>
      </div>
    </div>

    <section
      v-if="headset.configuredDevices.value.length === 0"
      class="info-card empty-state-card"
      :aria-label="t('devices.empty.label')"
    >
      <div>
        <p class="section-label">{{ t('devices.empty.label') }}</p>
        <h3>{{ t('devices.empty.title') }}</h3>
      </div>
      <p class="muted-text">
        {{ t('devices.empty.description') }}
      </p>
      <button type="button" class="primary-button" @click="openCreateForm">
        {{ t('devices.actions.addDevice') }}
      </button>
    </section>

    <section v-else class="device-grid" :aria-label="t('devices.title')">
      <DeviceCard
        v-for="device in headset.configuredDevices.value"
        :key="device.id"
        :device="device"
        :profile="headset.getStreamProfileForDevice(device)"
        :runtime="headset.getRuntimeForDevice(device.id)"
        :operation="headset.getOperationForDevice(device.id)"
        :is-adb-available="headset.isAdbAvailable.value"
        :is-scrcpy-available="headset.isScrcpyAvailable.value"
        :is-any-stream-running="headset.isScrcpyRunning.value"
        :is-this-stream-running="headset.isStreamRunningForDevice(device)"
        @connect="headset.connectDevice"
        @disconnect="headset.disconnectDevice"
        @start-stream="headset.startScrcpy"
        @stop-stream="headset.stopScrcpy"
        @launch-game="openLaunchGame"
        @diagnostics="openDiagnostics"
        @edit="openEditForm"
      />
    </section>

    <DeviceFormModal
      v-if="isDeviceFormOpen"
      :devices="headset.configuredDevices.value"
      :stream-profiles="headset.streamProfiles.value"
      :device="editingDevice"
      @cancel="closeDeviceForm"
      @create="createDevice"
      @update="updateDevice"
      @delete="deleteDevice"
    />

    <LaunchGameModal
      v-if="launchGameDevice"
      :device="launchGameDevice"
      @close="closeLaunchGame"
    />

    <DeviceDiagnosticsModal
      v-if="diagnosticsDevice"
      :device="diagnosticsDevice"
      :profile="headset.getStreamProfileForDevice(diagnosticsDevice)"
      :runtime="headset.getRuntimeForDevice(diagnosticsDevice.id)"
      @close="closeDiagnostics"
    />
  </section>
</template>
