<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import oneplaceMark from '../../assets/branding/oneplace-mark.svg'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DeviceConfig,
  StreamProfileConfig
} from '../../../../shared/contracts/config.contracts'
import type {
  DeviceRuntimeState,
  DeviceTimeSyncResult
} from '../../../../shared/contracts/headset.contracts'
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
  isThisStreamRunning: boolean
  timeSyncResult?: DeviceTimeSyncResult | null
}>()

const emit = defineEmits<{
  connect: [device: DeviceConfig]
  disconnect: [device: DeviceConfig]
  startStream: [device: DeviceConfig]
  stopStream: [device: DeviceConfig]
  diagnostics: [device: DeviceConfig]
  launchGame: [device: DeviceConfig]
  edit: [device: DeviceConfig]
  syncTime: [device: DeviceConfig]
}>()

const { t } = useI18n()
const actionsMenu = ref<HTMLDetailsElement | null>(null)
const dismissMenu = (event: PointerEvent): void => {
  if (
    actionsMenu.value &&
    event.target instanceof Node &&
    !actionsMenu.value.contains(event.target)
  ) {
    actionsMenu.value.open = false
  }
}
onMounted(() => document.addEventListener('pointerdown', dismissMenu))
onUnmounted(() => document.removeEventListener('pointerdown', dismissMenu))
const openDetails = (action: 'diagnostics' | 'edit'): void => {
  if (actionsMenu.value) actionsMenu.value.open = false
  if (action === 'edit') emit('edit', props.device)
  else emit('diagnostics', props.device)
}
const syncTime = (): void => {
  if (actionsMenu.value) actionsMenu.value.open = false
  emit('syncTime', props.device)
}
const timeSyncMessage = computed(() => {
  if (props.operation === 'syncTime') return t('devices.timeSync.progress')
  const result = props.timeSyncResult
  if (!result || (result.ok && result.address !== props.device.address)) return ''
  return result.ok ? t('devices.timeSync.success') : t(`devices.timeSync.errors.${result.code}`)
})
const streamHint = computed(() => {
  if (props.operation || props.runtime.streamState === 'stopping') return t('devices.hints.busy')
  if (props.isThisStreamRunning) return ''
  if (!props.isScrcpyAvailable) return t('devices.hints.scrcpy')
  if (props.runtime.connectionState !== 'connected') return t('devices.hints.connect')
  return ''
})

const connectionAction = computed(() =>
  getConnectionAction(props.runtime, props.operation, props.isAdbAvailable)
)
const streamAction = computed(() =>
  getStreamAction(
    props.runtime,
    props.operation,
    props.isScrcpyAvailable,
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
  <article
    class="device-card"
    :class="{
      'is-connected': runtime.connectionState === 'connected',
      'is-streaming': isThisStreamRunning
    }"
    :aria-label="device.name"
  >
    <div class="device-card-row">
      <div class="device-main">
        <span class="device-avatar" aria-hidden="true"><img :src="oneplaceMark" alt="" /></span>
        <div class="device-identity">
          <h3 class="device-title" :title="device.name">{{ device.name }}</h3>
          <span class="device-address">{{ device.address }}</span>
        </div>
        <span class="connection-badge" :class="connectionTone"
          ><i aria-hidden="true" />{{ connectionStatusLabel }}</span
        >
      </div>
      <div class="device-status-strip">
        <div
          class="battery-status"
          :class="{ low: runtime.batteryLevel !== null && runtime.batteryLevel < 20 }"
        >
          <span class="status-label">{{ t('devices.battery.label') }}</span>
          <div class="battery-value">
            <span class="battery-icon" aria-hidden="true"
              ><span :style="{ width: `${runtime.batteryLevel ?? 0}%` }" /></span
            ><strong>{{ batteryLabel }}</strong>
          </div>
        </div>
        <DeviceStatusSummary :label="t('devices.application.label')" :value="applicationLabel" />
        <DeviceStatusSummary
          :label="t('devices.stream.label')"
          :value="streamStatusLabel"
          :tone="streamTone"
        />
      </div>
      <div class="device-card-bottom">
        <button
          type="button"
          class="secondary-button compact-button library-open"
          :aria-label="t('devices.library.title')"
          :disabled="runtime.connectionState !== 'connected' || operation !== null"
          :title="
            runtime.connectionState !== 'connected'
              ? t('devices.hints.connect')
              : t('devices.library.title')
          "
          @click="emit('launchGame', device)"
        >
          <AppIcon name="grid" :size="16" /><span class="library-open-label">{{
            t('devices.library.title')
          }}</span>
        </button>
        <div class="device-actions">
          <button
            type="button"
            class="secondary-button compact-button"
            :disabled="connectionAction.disabled"
            :aria-busy="operation === 'connect' || operation === 'disconnect'"
            :title="!isAdbAvailable ? t('devices.hints.adb') : undefined"
            @click="runConnectionAction"
          >
            <AppIcon
              :name="connectionAction.action === 'disconnect' ? 'unplug' : 'plug'"
              :size="16"
            />
            <span class="device-action-label">
              <span
                v-for="key in ['connect', 'disconnect']"
                :key="key"
                class="device-action-label-sizer"
                aria-hidden="true"
                >{{ t(`common.actions.${key}`) }}</span
              >
              <span>{{
                t(
                  connectionAction.action === 'disconnect'
                    ? 'common.actions.disconnect'
                    : 'common.actions.connect'
                )
              }}</span>
            </span>
          </button>
          <span :title="streamHint"
            ><button
              type="button"
              :class="`${streamAction.tone}-button compact-button`"
              :disabled="streamAction.disabled"
              :aria-label="t(streamAction.labelKey)"
              :aria-busy="operation === 'startScrcpy' || operation === 'stopScrcpy'"
              @click="runStreamAction"
            >
              <AppIcon :name="streamAction.action === 'stopStream' ? 'stop' : 'play'" :size="16" />
              <span class="device-action-label">
                <span
                  v-for="key in ['cast', 'stopCasting']"
                  :key="key"
                  class="device-action-label-sizer"
                  aria-hidden="true"
                  >{{ t(`devices.actions.${key}`) }}</span
                >
                <span>{{
                  t(
                    streamAction.action === 'stopStream'
                      ? 'devices.actions.stopCasting'
                      : 'devices.actions.cast'
                  )
                }}</span>
              </span>
            </button></span
          >
          <details
            ref="actionsMenu"
            class="device-menu"
            @keydown.esc.prevent="actionsMenu && (actionsMenu.open = false)"
          >
            <summary class="icon-button" :aria-label="t('devices.actions.deviceMenu')">
              <AppIcon name="more" />
            </summary>
            <div class="device-menu-panel">
              <button
                type="button"
                :disabled="
                  !isAdbAvailable || runtime.connectionState !== 'connected' || operation !== null
                "
                :title="t('devices.timeSync.hint')"
                @click="syncTime"
              >
                <AppIcon name="clock" :size="16" />{{ t('devices.timeSync.action') }}
              </button>
              <button type="button" @click="openDetails('diagnostics')">
                <AppIcon name="info" :size="16" />{{ t('devices.diagnostics.title') }}
              </button>
              <button type="button" @click="openDetails('edit')">
                <AppIcon name="edit" :size="16" />{{ t('common.actions.edit') }}
              </button>
            </div>
          </details>
        </div>
      </div>
      <p v-if="streamHint && !isThisStreamRunning" class="device-action-hint">{{ streamHint }}</p>
      <p
        v-if="timeSyncMessage"
        class="device-action-hint device-time-feedback"
        :class="{
          'time-sync-error': timeSyncResult && !timeSyncResult.ok && operation !== 'syncTime'
        }"
        role="status"
      >
        {{ timeSyncMessage }}
      </p>
    </div>
  </article>
</template>
