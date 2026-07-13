<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeviceConfig, StreamProfileConfig } from '../../../../shared/contracts/config.contracts'
import type { DeviceRuntimeState } from '../../../../shared/contracts/headset.contracts'
import {
  getApplicationLabel,
  getConnectionAction,
  getConnectionStatusLabel,
  getStreamAction,
  getStreamStatusLabel,
  type DeviceOperation
} from './device-card.model'
import DeviceStatusSummary from './DeviceStatusSummary.vue'

const props = defineProps<{
  device: DeviceConfig
  profile: StreamProfileConfig | null
  runtime: DeviceRuntimeState
  operation: DeviceOperation | null
  isAdbAvailable: boolean
  isScrcpyAvailable: boolean
  isAnyStreamRunning: boolean
  isThisStreamRunning: boolean
}>()

const emit = defineEmits<{
  connect: [device: DeviceConfig]
  disconnect: [device: DeviceConfig]
  startStream: [device: DeviceConfig]
  stopStream: [device: DeviceConfig]
  launchGame: [device: DeviceConfig]
  diagnostics: [device: DeviceConfig]
  edit: [device: DeviceConfig]
}>()

const { t } = useI18n()

const connectionAction = computed(() =>
  getConnectionAction(props.runtime, props.operation, props.isAdbAvailable)
)
const streamAction = computed(() =>
  getStreamAction(
    props.runtime,
    props.operation,
    props.isScrcpyAvailable,
    props.isAnyStreamRunning,
    props.isThisStreamRunning
  )
)
const connectionStatus = computed(() => getConnectionStatusLabel(props.runtime, props.operation))
const streamStatus = computed(() => getStreamStatusLabel(props.runtime, props.operation))
const batteryLabel = computed(() => {
  if (props.runtime.batteryLevel === null) return t('common.states.none')
  return `${props.runtime.batteryLevel}%${
    props.runtime.isCharging ? ` ${t('devices.battery.charging')}` : ''
  }`
})

const connectionStatusLabel = computed(() => {
  if (connectionStatus.value === 'Connected') return t('devices.status.connected')
  if (connectionStatus.value === 'Connecting') return t('devices.status.connecting')
  if (connectionStatus.value === 'Disconnecting') return t('devices.status.disconnecting')
  if (connectionStatus.value === 'Connection error') return t('devices.status.connectionError')
  if (connectionStatus.value === 'Unauthorized') return t('devices.status.unauthorized')
  return t('devices.status.offline')
})

const streamStatusLabel = computed(() => {
  if (streamStatus.value === 'Streaming') return t('devices.stream.streaming')
  if (streamStatus.value === 'Starting stream') return t('devices.stream.starting')
  if (streamStatus.value === 'Stopping stream') return t('devices.stream.stopping')
  if (streamStatus.value === 'Stream failed') return t('devices.stream.failed')
  return t('devices.stream.notStreaming')
})
const applicationLabel = computed(() => {
  const label = getApplicationLabel(
    props.runtime.foregroundApplicationName,
    props.runtime.foregroundPackage
  )
  return label === 'Unknown' ? t('devices.application.unknown') : label
})

const connectionTone = computed(() => {
  if (connectionStatus.value === 'Connected') {
    return 'ok'
  }

  if (connectionStatus.value === 'Connection error') {
    return 'error'
  }

  if (connectionStatus.value === 'Connecting' || connectionStatus.value === 'Disconnecting') {
    return 'warning'
  }

  return 'neutral'
})

const streamTone = computed(() => {
  if (streamStatus.value === 'Streaming') {
    return 'ok'
  }

  if (streamStatus.value === 'Stream failed') {
    return 'error'
  }

  if (streamStatus.value === 'Starting stream' || streamStatus.value === 'Stopping stream') {
    return 'warning'
  }

  return 'neutral'
})

const runConnectionAction = (): void => {
  if (connectionAction.value.action === 'disconnect') {
    emit('disconnect', props.device)
    return
  }

  emit('connect', props.device)
}

const runStreamAction = (): void => {
  if (streamAction.value.action === 'stopStream') {
    emit('stopStream', props.device)
    return
  }

  emit('startStream', props.device)
}
</script>

<template>
  <article class="device-card" :aria-label="`${device.name} controls`">
    <div class="device-card-row">
      <span class="device-main">
        <span class="device-title">{{ device.name }}</span>
        <span class="device-address">{{ device.address }}</span>
      </span>

      <span class="device-status-strip">
        <DeviceStatusSummary
          :label="t('devices.status.label')"
          :value="connectionStatusLabel"
          :tone="connectionTone"
        />
        <DeviceStatusSummary :label="t('devices.battery.label')" :value="batteryLabel" />
        <DeviceStatusSummary :label="t('devices.application.label')" :value="applicationLabel" />
        <DeviceStatusSummary
          :label="t('devices.stream.label')"
          :value="streamStatusLabel"
          :tone="streamTone"
        />
      </span>

      <span class="device-actions">
        <button
          type="button"
          :class="`${connectionAction.tone}-button compact-button`"
          :disabled="connectionAction.disabled"
          @click="runConnectionAction"
        >
          {{ t(connectionAction.labelKey) }}
        </button>
        <button
          type="button"
          :class="`${streamAction.tone}-button compact-button`"
          :disabled="streamAction.disabled"
          @click="runStreamAction"
        >
          {{ t(streamAction.labelKey) }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          @click="$emit('launchGame', device)"
        >
          {{ t('devices.actions.launchGame') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          @click="$emit('diagnostics', device)"
        >
          {{ t('common.actions.more') }}
        </button>
        <button type="button" class="secondary-button compact-button" @click="$emit('edit', device)">
          {{ t('common.actions.edit') }}
        </button>
      </span>
    </div>
  </article>
</template>
