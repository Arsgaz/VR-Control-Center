<script setup lang="ts">
import type { DeviceConfig, StreamProfileConfig } from '../../../../shared/contracts/config.contracts'
import type { DeviceRuntimeState } from '../../../../shared/contracts/headset.contracts'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getApplicationLabel } from './device-card.model'

const props = defineProps<{
  device: DeviceConfig
  profile: StreamProfileConfig | null
  runtime: DeviceRuntimeState
}>()

defineEmits<{
  close: []
}>()

const { t } = useI18n()

const connectionStatusLabel = computed(() => {
  if (props.runtime.connectionState === 'connected') return t('devices.status.connected')
  if (props.runtime.connectionState === 'error') return t('devices.status.connectionError')
  if (props.runtime.connectionState === 'unauthorized') return t('devices.status.unauthorized')
  return t('devices.status.offline')
})

const streamStatusLabel = computed(() => {
  if (props.runtime.streamState === 'running') return t('devices.stream.streaming')
  if (props.runtime.streamState === 'error') return t('devices.stream.failed')
  return t('devices.stream.notStreaming')
})

const batteryLabel = computed(() => {
  if (props.runtime.batteryLevel === null) return t('common.states.none')
  return `${props.runtime.batteryLevel}%${
    props.runtime.isCharging ? ` ${t('devices.battery.charging')}` : ''
  }`
})

const applicationLabel = computed(() => {
  const label = getApplicationLabel(
    props.runtime.foregroundApplicationName,
    props.runtime.foregroundPackage
  )
  return label === 'Unknown' ? t('devices.application.unknown') : label
})
</script>

<template>
  <div class="modal-backdrop" role="presentation" @click.self="$emit('close')">
    <section class="modal-panel diagnostics-panel" aria-labelledby="device-diagnostics-title">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('devices.diagnostics.title') }}</p>
          <h3 id="device-diagnostics-title">{{ device.name }}</h3>
        </div>
      </div>

      <dl class="details-grid diagnostics-grid">
        <div>
          <dt>{{ t('devices.diagnostics.name') }}</dt>
          <dd>{{ device.name }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.address') }}</dt>
          <dd>{{ device.address }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.streamProfile') }}</dt>
          <dd>{{ profile?.name ?? t('devices.form.noProfile') }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.adbState') }}</dt>
          <dd>{{ connectionStatusLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.adbDetails') }}</dt>
          <dd>{{ runtime.connectionMessage }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.streamState') }}</dt>
          <dd>{{ streamStatusLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.streamDetails') }}</dt>
          <dd>{{ runtime.streamMessage }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.sessionId') }}</dt>
          <dd>{{ runtime.streamSessionId ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.lastError') }}</dt>
          <dd>{{ runtime.lastError ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.battery') }}</dt>
          <dd>{{ batteryLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.batteryStatus') }}</dt>
          <dd>{{ runtime.batteryStatus ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.batteryTemperature') }}</dt>
          <dd>{{ runtime.batteryTemperatureCelsius ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.batteryVoltage') }}</dt>
          <dd>{{ runtime.batteryVoltageMillivolts ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.application') }}</dt>
          <dd>{{ applicationLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.foregroundActivity') }}</dt>
          <dd>{{ runtime.foregroundActivity ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('devices.diagnostics.lastUpdate') }}</dt>
          <dd>{{ runtime.lastRuntimeRefreshAt ?? '-' }}</dd>
        </div>
      </dl>

      <section class="future-diagnostics">
        <p class="section-label">{{ t('devices.diagnostics.preparedTitle') }}</p>
        <p class="muted-text">
          {{ t('devices.diagnostics.preparedDescription') }}
        </p>
      </section>

      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="$emit('close')">
          {{ t('common.actions.close') }}
        </button>
      </div>
    </section>
  </div>
</template>
import { useI18n } from 'vue-i18n'
