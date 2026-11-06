<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import UsbConnectionModal from '../devices/UsbConnectionModal.vue'
import type { UsbConnectionResult } from '../../../../shared/contracts/headset.contracts'
import oneplaceMark from '../../assets/branding/oneplace-mark.svg'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DeviceConfig,
  DeviceConfigUpdate,
  NewDeviceConfig
} from '../../../../shared/contracts/config.contracts'
import DeviceDiagnosticsModal from '../devices/DeviceDiagnosticsModal.vue'
import DeviceCard from '../devices/DeviceCard.vue'
import LaunchGameModal from '../devices/LaunchGameModal.vue'
import DeviceFormModal from '../devices/DeviceFormModal.vue'
import {
  createEmptyDeviceOverlaySelection,
  openDiagnosticsOverlay,
  openLaunchGameOverlay
} from '../devices/device-overlay.model'
import { useHeadsetController } from '../../composables/useHeadsetController'

defineEmits<{ settings: [] }>()
const headset = useHeadsetController()
const connectedCount = computed(
  () =>
    headset.configuredDevices.value.filter(
      (device) => headset.getRuntimeForDevice(device.id).connectionState === 'connected'
    ).length
)
const { t } = useI18n()
const isUsbOpen = ref(false)
const saveUsbDevice = async (
  result: Extract<UsbConnectionResult, { status: 'connected' }>
): Promise<boolean> => {
  let device = headset.configuredDevices.value.find((item) => item.address === result.address)
  if (!device) {
    const id = `device-${globalThis.crypto.randomUUID()}`
    const saved = await headset.addDevice({
      id,
      name: `${result.name} (${result.address.split(':')[0]})`,
      address: result.address,
      streamProfileId: null
    })
    if (!saved) return false
    device = headset.configuredDevices.value.find((item) => item.id === id)
  }
  if (device) await headset.refreshRuntime(device)
  return true
}
const isDeviceFormOpen = ref(false)
const editingDevice = ref<DeviceConfig | null>(null)
const overlaySelection = ref(createEmptyDeviceOverlaySelection())

const launchGameDevice = computed(
  () =>
    headset.configuredDevices.value.find(
      (device) => device.id === overlaySelection.value.launchGameDeviceId
    ) ?? null
)
const openLaunchGame = (device: DeviceConfig): void => {
  overlaySelection.value = openLaunchGameOverlay(overlaySelection.value, device.id)
}
const closeLaunchGame = (): void => {
  overlaySelection.value = { ...overlaySelection.value, launchGameDeviceId: null }
}

const diagnosticsDevice = computed(() => {
  return (
    headset.configuredDevices.value.find(
      (device) => device.id === overlaySelection.value.diagnosticsDeviceId
    ) ?? null
  )
})

const openCreateForm = (): void => {
  headset.configError.value = null
  editingDevice.value = null
  isDeviceFormOpen.value = true
}

const openEditForm = (device: DeviceConfig): void => {
  headset.configError.value = null
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

const openDiagnostics = (device: DeviceConfig): void => {
  overlaySelection.value = openDiagnosticsOverlay(overlaySelection.value, device.id)
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
        <div class="title-row">
          <h2 id="devices-title">{{ t('devices.section.title') }}</h2>
          <span class="count-badge">{{ headset.configuredDevices.value.length }}</span>
        </div>
        <p class="muted-text">
          {{ t('devices.section.description') }}
        </p>
      </div>

      <div class="section-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="isUsbOpen || !headset.isAdbAvailable.value"
          @click="isUsbOpen = true"
        >
          <AppIcon name="usb" />{{ t('devices.usb.action') }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="headset.isBusy.value || !headset.isAdbAvailable.value"
          @click="headset.refreshDevices"
        >
          <AppIcon name="refresh" />
          {{
            headset.operation.value === 'devices'
              ? t('devices.actions.refreshing')
              : t('devices.actions.refreshAdbDevices')
          }}
        </button>
        <button
          v-if="headset.configuredDevices.value.length"
          type="button"
          class="primary-button"
          @click="openCreateForm"
        >
          <AppIcon name="plus" />{{ t('devices.actions.addDevice') }}
        </button>
      </div>
    </div>

    <div
      v-if="
        headset.environment.value &&
        (!headset.isAdbAvailable.value || !headset.isScrcpyAvailable.value)
      "
      class="setup-banner"
      role="status"
    >
      <span class="setup-banner-icon"><AppIcon name="alert" /></span>
      <div>
        <strong>{{ t('devices.setup.title') }}</strong>
        <p>
          {{ !headset.isAdbAvailable.value ? t('devices.setup.adb') : t('devices.setup.scrcpy') }}
        </p>
      </div>
      <button type="button" class="secondary-button" @click="$emit('settings')">
        {{ t('devices.setup.action') }} <AppIcon name="arrow" :size="16" />
      </button>
    </div>
    <p v-if="headset.configuredDevices.value.length" class="device-overview">
      {{
        t('devices.connectedCount', {
          count: connectedCount,
          total: headset.configuredDevices.value.length
        })
      }}
    </p>

    <section
      v-if="headset.configuredDevices.value.length === 0"
      class="info-card empty-state-card"
      :aria-label="t('devices.empty.label')"
    >
      <div class="empty-device-symbol" aria-hidden="true"><img :src="oneplaceMark" alt="" /></div>
      <div>
        <h3>{{ t('devices.empty.title') }}</h3>
      </div>
      <p class="muted-text">
        {{ t('devices.empty.description') }}
      </p>
      <ol class="setup-steps">
        <li>{{ t('devices.setup.step1') }}</li>
        <li>{{ t('devices.setup.step2') }}</li>
        <li>{{ t('devices.setup.step3') }}</li>
      </ol>
      <button type="button" class="primary-button" @click="openCreateForm">
        <AppIcon name="plus" />{{ t('devices.actions.addDevice') }}
      </button>
    </section>

    <section v-else class="device-grid" :aria-label="t('devices.section.title')">
      <DeviceCard
        v-for="device in headset.configuredDevices.value"
        :key="device.id"
        :device="device"
        :profile="headset.getStreamProfileForDevice(device)"
        :runtime="headset.getRuntimeForDevice(device.id)"
        :operation="headset.getOperationForDevice(device.id)"
        :is-adb-available="headset.isAdbAvailable.value"
        :is-scrcpy-available="headset.isScrcpyAvailable.value"
        :is-this-stream-running="headset.isStreamRunningForDevice(device)"
        :time-sync-result="headset.timeSyncResults.value[device.id] ?? null"
        @connect="headset.connectDevice"
        @disconnect="headset.disconnectDevice"
        @sync-time="headset.syncTime"
        @start-stream="headset.startScrcpy"
        @stop-stream="headset.stopScrcpy"
        @launch-game="openLaunchGame"
        @diagnostics="openDiagnostics"
        @edit="openEditForm"
      />
    </section>

    <UsbConnectionModal v-if="isUsbOpen" :save="saveUsbDevice" @close="isUsbOpen = false" />

    <DeviceFormModal
      v-if="isDeviceFormOpen"
      :devices="headset.configuredDevices.value"
      :stream-profiles="headset.streamProfiles.value"
      :device="editingDevice"
      :busy="headset.isConfigLoading.value"
      :error="
        headset.configError.value
          ? t(editingDevice ? 'dialogs.errors.updateDevice' : 'dialogs.errors.addDevice')
          : null
      "
      @cancel="closeDeviceForm"
      @create="createDevice"
      @update="updateDevice"
      @delete="deleteDevice"
    />

    <LaunchGameModal
      v-if="launchGameDevice"
      :device="launchGameDevice"
      :connected="headset.getRuntimeForDevice(launchGameDevice.id).connectionState === 'connected'"
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
