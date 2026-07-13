<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type {
  AdbDevice,
  EnvironmentCheck,
  ScrcpyStatus
} from '../../../shared/contracts/headset.contracts'

type Operation =
  | 'environment'
  | 'devices'
  | 'connect'
  | 'disconnect'
  | 'startScrcpy'
  | 'stopScrcpy'
  | null

type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'process'

interface LogEntry {
  id: number
  time: string
  level: LogLevel
  message: string
}

const LOG_LIMIT = 80

const environment = ref<EnvironmentCheck | null>(null)
const devices = ref<AdbDevice[]>([])
const address = ref('192.168.1.100:5555')
const crop = ref('')
const noAudio = ref(true)
const operation = ref<Operation>(null)
const adbConnectionState = ref<'unknown' | 'connected' | 'disconnected' | 'error'>('unknown')
const adbConnectionMessage = ref('Run device discovery or connect to update ADB state.')
const scrcpyStatus = ref<ScrcpyStatus | null>(null)
const logEntries = ref<LogEntry[]>([])
let nextLogId = 1
let unsubscribeScrcpy: (() => void) | null = null

const isBusy = computed(() => operation.value !== null)
const isAdbAvailable = computed(() => environment.value?.adb.available === true)
const isScrcpyAvailable = computed(() => environment.value?.scrcpy.available === true)
const isScrcpyRunning = computed(() => scrcpyStatus.value?.running === true)

const matchingDevice = computed(() => {
  const trimmedAddress = address.value.trim()
  return devices.value.find((device) => device.serial === trimmedAddress) ?? null
})

const addLog = (level: LogLevel, message: string): void => {
  logEntries.value = [
    {
      id: nextLogId,
      time: new Date().toLocaleTimeString(),
      level,
      message
    },
    ...logEntries.value
  ].slice(0, LOG_LIMIT)
  nextLogId += 1
}

const setOperation = async (currentOperation: Exclude<Operation, null>, task: () => Promise<void>) => {
  operation.value = currentOperation

  try {
    await task()
  } finally {
    operation.value = null
  }
}

const getRequiredAddress = (): string | null => {
  const trimmedAddress = address.value.trim()

  if (!trimmedAddress) {
    const message = 'Device address is required.'
    adbConnectionState.value = 'error'
    adbConnectionMessage.value = message
    addLog('error', message)
    return null
  }

  return trimmedAddress
}

const refreshScrcpyStatus = async (): Promise<void> => {
  scrcpyStatus.value = await window.arena.headset.getScrcpyStatus()
}

const checkEnvironment = async (): Promise<void> => {
  await setOperation('environment', async () => {
    addLog('info', 'Checking ADB and scrcpy availability.')
    environment.value = await window.arena.headset.checkEnvironment()
    addLog(
      environment.value.adb.available ? 'success' : 'error',
      environment.value.adb.available
        ? `ADB available: ${environment.value.adb.version ?? 'version unknown'}`
        : `ADB unavailable: ${environment.value.adb.message}`
    )
    addLog(
      environment.value.scrcpy.available ? 'success' : 'error',
      environment.value.scrcpy.available
        ? `scrcpy available: ${environment.value.scrcpy.version ?? 'version unknown'}`
        : `scrcpy unavailable: ${environment.value.scrcpy.message}`
    )
  })
}

const refreshDevices = async (): Promise<void> => {
  if (!isAdbAvailable.value) {
    addLog('error', 'ADB is not available. Check the environment first.')
    return
  }

  await setOperation('devices', async () => {
    addLog('info', 'Requesting ADB device list.')

    try {
      const result = await window.arena.headset.listAdbDevices()
      devices.value = result.devices
      const device = matchingDevice.value

      if (!device) {
        adbConnectionState.value = 'disconnected'
        adbConnectionMessage.value = 'No matching ADB device found.'
      } else if (device.state === 'device') {
        adbConnectionState.value = 'connected'
        adbConnectionMessage.value = `ADB device is connected: ${device.serial}`
      } else {
        adbConnectionState.value = 'error'
        adbConnectionMessage.value = `ADB device state is ${device.rawState}.`
      }

      addLog('success', `ADB devices loaded: ${result.devices.length}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to list ADB devices.'
      adbConnectionState.value = 'error'
      adbConnectionMessage.value = message
      addLog('error', message)
      console.error('Failed to list ADB devices:', error)
    }
  })
}

const connectDevice = async (): Promise<void> => {
  const targetAddress = getRequiredAddress()
  if (!targetAddress) {
    return
  }

  if (!isAdbAvailable.value) {
    addLog('error', 'ADB is not available. Check the environment first.')
    return
  }

  await setOperation('connect', async () => {
    addLog('info', `Connecting ADB to ${targetAddress}.`)

    try {
      const result = await window.arena.headset.connectDevice(targetAddress)
      adbConnectionState.value = result.ok ? 'connected' : 'error'
      adbConnectionMessage.value = result.message
      addLog(result.ok ? 'success' : 'error', result.message)
      await refreshDevices()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ADB connect failed.'
      adbConnectionState.value = 'error'
      adbConnectionMessage.value = message
      addLog('error', message)
      console.error('Failed to connect ADB device:', error)
    }
  })
}

const disconnectDevice = async (): Promise<void> => {
  const targetAddress = getRequiredAddress()
  if (!targetAddress) {
    return
  }

  if (!isAdbAvailable.value) {
    addLog('error', 'ADB is not available. Check the environment first.')
    return
  }

  await setOperation('disconnect', async () => {
    addLog('info', `Disconnecting ADB from ${targetAddress}.`)

    try {
      const result = await window.arena.headset.disconnectDevice(targetAddress)
      adbConnectionState.value = result.ok ? 'disconnected' : 'error'
      adbConnectionMessage.value = result.message
      addLog(result.ok ? 'success' : 'error', result.message)
      await refreshDevices()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ADB disconnect failed.'
      adbConnectionState.value = 'error'
      adbConnectionMessage.value = message
      addLog('error', message)
      console.error('Failed to disconnect ADB device:', error)
    }
  })
}

const startScrcpy = async (): Promise<void> => {
  const targetAddress = getRequiredAddress()
  if (!targetAddress) {
    return
  }

  if (!isScrcpyAvailable.value) {
    addLog('error', 'scrcpy is not available. Check the environment first.')
    return
  }

  if (isScrcpyRunning.value) {
    addLog('warning', 'scrcpy is already running.')
    return
  }

  await setOperation('startScrcpy', async () => {
    addLog('info', `Starting scrcpy for ${targetAddress}.`)
    const result = await window.arena.headset.startScrcpy({
      address: targetAddress,
      crop: crop.value,
      noAudio: noAudio.value
    })
    scrcpyStatus.value = result.status
    addLog(result.ok ? 'success' : 'error', result.message)
  })
}

const stopScrcpy = async (): Promise<void> => {
  if (!isScrcpyRunning.value) {
    addLog('warning', 'scrcpy is not running.')
    return
  }

  await setOperation('stopScrcpy', async () => {
    addLog('info', 'Stopping scrcpy.')
    const result = await window.arena.headset.stopScrcpy()
    scrcpyStatus.value = result.status
    addLog(result.ok ? 'success' : 'error', result.message)
  })
}

onMounted(() => {
  unsubscribeScrcpy = window.arena.headset.onScrcpyEvent((event) => {
    scrcpyStatus.value = event.status
    addLog(event.type === 'stderr' || event.type === 'error' ? 'error' : 'process', event.message)
  })

  void refreshScrcpyStatus()
  void checkEnvironment()
})

onUnmounted(() => {
  unsubscribeScrcpy?.()
})
</script>

<template>
  <section class="workflow-grid">
    <section class="info-card environment-card" aria-labelledby="environment-title">
      <div class="card-header">
        <div>
          <p class="section-label">Environment</p>
          <h2 id="environment-title">Local tools</h2>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="isBusy"
          @click="checkEnvironment"
        >
          {{ operation === 'environment' ? 'Checking...' : 'Check environment' }}
        </button>
      </div>

      <div class="tool-grid">
        <article class="tool-tile">
          <span class="status-pill" :class="environment?.adb.available ? 'ok' : 'bad'">
            {{ environment?.adb.available ? 'Available' : 'Unavailable' }}
          </span>
          <h3>ADB</h3>
          <p>{{ environment?.adb.version ?? environment?.adb.message ?? 'Not checked yet' }}</p>
        </article>

        <article class="tool-tile">
          <span class="status-pill" :class="environment?.scrcpy.available ? 'ok' : 'bad'">
            {{ environment?.scrcpy.available ? 'Available' : 'Unavailable' }}
          </span>
          <h3>scrcpy</h3>
          <p>{{ environment?.scrcpy.version ?? environment?.scrcpy.message ?? 'Not checked yet' }}</p>
        </article>
      </div>
    </section>

    <section class="info-card device-card" aria-labelledby="device-title">
      <div class="card-header">
        <div>
          <p class="section-label">Device</p>
          <h2 id="device-title">Test headset</h2>
        </div>
      </div>

      <div class="form-grid">
        <label>
          <span>Address IP:port</span>
          <input v-model="address" type="text" autocomplete="off" placeholder="192.168.1.100:5555" />
        </label>

        <label>
          <span>Crop</span>
          <input v-model="crop" type="text" autocomplete="off" placeholder="Empty" />
        </label>

        <label class="toggle-row">
          <input v-model="noAudio" type="checkbox" />
          <span>No audio</span>
        </label>
      </div>

      <div class="state-grid">
        <div class="state-box">
          <p class="section-label">ADB connection</p>
          <strong :class="`state-${adbConnectionState}`">{{ adbConnectionState }}</strong>
          <span>{{ adbConnectionMessage }}</span>
        </div>

        <div class="state-box">
          <p class="section-label">scrcpy stream</p>
          <strong :class="`state-${scrcpyStatus?.state ?? 'stopped'}`">
            {{ scrcpyStatus?.state ?? 'stopped' }}
          </strong>
          <span>{{ scrcpyStatus?.message ?? 'scrcpy is not running' }}</span>
        </div>
      </div>

      <div class="actions-grid">
        <button type="button" class="secondary-button" :disabled="isBusy || !isAdbAvailable" @click="refreshDevices">
          {{ operation === 'devices' ? 'Refreshing...' : 'Refresh devices' }}
        </button>
        <button type="button" class="primary-button" :disabled="isBusy || !isAdbAvailable" @click="connectDevice">
          {{ operation === 'connect' ? 'Connecting...' : 'Connect' }}
        </button>
        <button type="button" class="secondary-button" :disabled="isBusy || !isAdbAvailable" @click="disconnectDevice">
          {{ operation === 'disconnect' ? 'Disconnecting...' : 'Disconnect' }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="isBusy || !isScrcpyAvailable || isScrcpyRunning"
          @click="startScrcpy"
        >
          {{ operation === 'startScrcpy' ? 'Starting...' : 'Start stream' }}
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="isBusy || !isScrcpyRunning"
          @click="stopScrcpy"
        >
          {{ operation === 'stopScrcpy' ? 'Stopping...' : 'Stop stream' }}
        </button>
      </div>

      <div class="devices-list">
        <p class="section-label">ADB devices</p>
        <p v-if="devices.length === 0" class="muted-text">No ADB devices found.</p>
        <ul v-else>
          <li v-for="device in devices" :key="device.serial">
            <span>{{ device.serial }}</span>
            <span>{{ device.rawState }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="info-card log-card" aria-labelledby="log-title">
      <div class="card-header">
        <div>
          <p class="section-label">Journal</p>
          <h2 id="log-title">Actions and errors</h2>
        </div>
      </div>

      <ol class="log-list">
        <li v-for="entry in logEntries" :key="entry.id">
          <time>{{ entry.time }}</time>
          <span :class="`log-level ${entry.level}`">{{ entry.level }}</span>
          <p>{{ entry.message }}</p>
        </li>
      </ol>
    </section>
  </section>
</template>
