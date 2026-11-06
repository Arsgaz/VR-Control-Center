<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppModal from '../ui/AppModal.vue'
import type { AdbDevice, UsbConnectionResult } from '../../../../shared/contracts/headset.contracts'

const props = defineProps<{
  save: (result: Extract<UsbConnectionResult, { status: 'connected' }>) => Promise<boolean>
}>()
defineEmits<{ close: [] }>()
const { t } = useI18n()
const busy = ref(false)
const devices = ref<AdbDevice[]>([])
const error = ref<string | null>(null)
const connected = ref(false)
const verified = ref<Extract<UsbConnectionResult, { status: 'connected' }> | null>(null)

const connect = async (serial?: string): Promise<void> => {
  if (busy.value) return
  busy.value = true
  error.value = null
  devices.value = []
  try {
    const result = verified.value ?? (await window.vrControl.headset.connectUsb(serial))
    if (result.status === 'select') devices.value = result.devices
    else if (result.status === 'error') error.value = t(`devices.usb.errors.${result.code}`)
    else {
      verified.value = result
      if (await props.save(result)) connected.value = true
      else error.value = t('devices.usb.errors.SAVE_FAILED')
    }
  } catch {
    error.value = t('devices.usb.errors.COMMAND_FAILED')
  } finally {
    busy.value = false
  }
}
onMounted(() => void connect())
</script>

<template>
  <AppModal labelledby="usb-connection-title" :busy="busy" @close="$emit('close')">
    <section class="modal-panel usb-connection-panel">
      <div class="section-heading">
        <h2 id="usb-connection-title">{{ t('devices.usb.title') }}</h2>
        <p class="muted-text">{{ t('devices.usb.hint') }}</p>
      </div>
      <p v-if="busy" role="status">{{ t('devices.usb.progress') }}</p>
      <p v-if="connected" role="status">
        {{ t('devices.usb.success', { address: verified?.address }) }}
      </p>
      <p v-if="error" class="state-message error-message" role="alert">{{ error }}</p>
      <div v-if="devices.length" class="usb-device-list">
        <p>{{ t('devices.usb.select') }}</p>
        <button
          v-for="device in devices"
          :key="device.serial"
          type="button"
          class="secondary-button"
          @click="connect(device.serial)"
        >
          {{ device.model || t('devices.usb.device') }} · {{ device.serial }}
          <span v-if="device.state !== 'device'">
            — {{ t(`devices.usb.states.${device.state}`) }}</span
          >
        </button>
      </div>
      <div class="modal-actions">
        <button v-if="!busy && !connected" type="button" class="primary-button" @click="connect()">
          {{ t('devices.usb.retry') }}
        </button>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('close')">
          {{ t('devices.usb.close') }}
        </button>
      </div>
    </section>
  </AppModal>
</template>

<style scoped>
.usb-connection-panel {
  max-width: 560px;
}
.usb-device-list {
  display: grid;
  gap: 10px;
  margin: 20px 0;
}
.usb-device-list button {
  display: block;
  white-space: normal;
  line-height: 1.45;
  padding: 10px 12px;
  text-align: left;
  overflow-wrap: anywhere;
}
</style>
