<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppModal from '../ui/AppModal.vue'
import type { AdbDevice } from '../../../../shared/contracts/headset.contracts'
defineProps<{ devices: AdbDevice[] }>()
defineEmits<{ close: []; select: [serial: string] }>()
const { t } = useI18n()
</script>

<template>
  <AppModal labelledby="usb-connection-title" @close="$emit('close')">
    <section class="modal-panel usb-connection-panel">
      <div class="section-heading">
        <h2 id="usb-connection-title">{{ t('devices.usb.selectTitle') }}</h2>
      </div>
      <div v-if="devices.length" class="usb-device-list">
        <p>{{ t('devices.usb.select') }}</p>
        <button
          v-for="device in devices"
          :key="device.serial"
          type="button"
          class="secondary-button"
          @click="$emit('select', device.serial)"
        >
          {{ device.model || t('devices.usb.device') }} · {{ device.serial }}
          <span v-if="device.state !== 'device'">
            — {{ t(`devices.usb.states.${device.state}`) }}</span
          >
        </button>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="$emit('close')">
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
