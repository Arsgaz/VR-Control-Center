import { computed, ref } from 'vue'
import type { AppInfo, TechnicalLogInfo } from '../../../shared/contracts/app.contracts'
import type {
  DeviceConfig,
  DeviceConfigUpdate,
  NewDeviceConfig,
  StreamProfileConfig
} from '../../../shared/contracts/config.contracts'
import type {
  AdbDevice,
  DeviceRuntimeEvent,
  DeviceRuntimeState,
  EnvironmentCheck,
  ScrcpyProcessEvent,
  ScrcpyStatus
} from '../../../shared/contracts/headset.contracts'
import { toUserFacingError } from './event-log.model'
import { translate } from '../i18n'
import { useAppConfig } from './useAppConfig'
import { useEventLog } from './useEventLog'

type GlobalOperation = 'environment' | 'devices' | null
export type DeviceOperation = 'connect' | 'disconnect' | 'refreshRuntime' | 'startScrcpy' | 'stopScrcpy'

const createDeviceRuntime = (device: Pick<DeviceConfig, 'id' | 'address'>): DeviceRuntimeState => ({
  deviceId: device.id,
  deviceAddress: device.address,
  connectionState: 'unknown',
  connectionMessage: 'Runtime has not been refreshed yet.',
  streamState: 'stopped',
  streamSessionId: null,
  streamMessage: 'scrcpy is not running',
  batteryLevel: null,
  batteryStatus: null,
  isCharging: null,
  batteryTemperatureCelsius: null,
  batteryVoltageMillivolts: null,
  foregroundPackage: null,
  foregroundActivity: null,
  foregroundApplicationName: null,
  lastRuntimeRefreshAt: null,
  lastSuccessfulRuntimeRefreshAt: null,
  lastError: null,
  isRuntimeRefreshInProgress: false,
  suspendedAutoReconnect: false
})

const environment = ref<EnvironmentCheck | null>(null)
const adbDevices = ref<AdbDevice[]>([])
const appInfo = ref<AppInfo | null>(null)
const technicalLogInfo = ref<TechnicalLogInfo | null>(null)
const operation = ref<GlobalOperation>(null)
const deviceOperations = ref<Record<string, DeviceOperation | null>>({})
const deviceRuntimeById = ref<Record<string, DeviceRuntimeState>>({})
const scrcpyStatusByDeviceId = ref<Record<string, ScrcpyStatus>>({})
let isInitialized = false
let unsubscribeScrcpy: (() => void) | null = null
let unsubscribeRuntime: (() => void) | null = null

const setGlobalOperation = async (
  currentOperation: Exclude<GlobalOperation, null>,
  task: () => Promise<void>
) => {
  operation.value = currentOperation
  try {
    await task()
  } finally {
    operation.value = null
  }
}

const setDeviceOperation = async (
  deviceId: string,
  currentOperation: DeviceOperation,
  task: () => Promise<void>
) => {
  deviceOperations.value = { ...deviceOperations.value, [deviceId]: currentOperation }
  try {
    await task()
  } finally {
    deviceOperations.value = { ...deviceOperations.value, [deviceId]: null }
  }
}

const ensureDeviceRuntime = (device: Pick<DeviceConfig, 'id' | 'address'>): DeviceRuntimeState => {
  const existingRuntime = deviceRuntimeById.value[device.id]
  if (existingRuntime) {
    if (existingRuntime.deviceAddress === device.address) return existingRuntime
    const nextRuntime = { ...existingRuntime, deviceAddress: device.address }
    deviceRuntimeById.value = { ...deviceRuntimeById.value, [device.id]: nextRuntime }
    return nextRuntime
  }
  const runtime = createDeviceRuntime(device)
  deviceRuntimeById.value = { ...deviceRuntimeById.value, [device.id]: runtime }
  return runtime
}

const applyRuntime = (runtime: DeviceRuntimeState): void => {
  deviceRuntimeById.value = {
    ...deviceRuntimeById.value,
    [runtime.deviceId]: runtime
  }
}

const removeDeviceRuntime = (deviceId: string): void => {
  deviceRuntimeById.value = Object.fromEntries(
    Object.entries(deviceRuntimeById.value).filter(([id]) => id !== deviceId)
  )
  deviceOperations.value = Object.fromEntries(
    Object.entries(deviceOperations.value).filter(([id]) => id !== deviceId)
  )
  scrcpyStatusByDeviceId.value = Object.fromEntries(
    Object.entries(scrcpyStatusByDeviceId.value).filter(([id]) => id !== deviceId)
  )
}

const getDeviceLogName = (device: Pick<DeviceConfig, 'name' | 'address'>): string => {
  return device.name.trim() || device.address
}

export const useHeadsetController = () => {
  const { addEvent } = useEventLog()
  const appConfig = useAppConfig()

  const isBusy = computed(() => operation.value !== null)
  const isAdbAvailable = computed(() => environment.value?.adb.available === true)
  const isScrcpyAvailable = computed(() => environment.value?.scrcpy.available === true)
  const configuredDevices = computed(() => appConfig.config.value?.devices ?? [])
  const streamProfiles = computed(() => appConfig.config.value?.streamProfiles ?? [])
  const isScrcpyRunning = computed(() =>
    Object.values(scrcpyStatusByDeviceId.value).some((status) => status.running)
  )

  const refreshAppDiagnostics = async (): Promise<void> => {
    appInfo.value = await window.vrControl.getAppInfo()
    technicalLogInfo.value = await window.vrControl.getTechnicalLogInfo()
  }

  const getStreamProfileForDevice = (device: DeviceConfig): StreamProfileConfig | null => {
    return (
      streamProfiles.value.find((profile) => profile.id === device.streamProfileId) ??
      streamProfiles.value[0] ??
      null
    )
  }

  const getRuntimeForDevice = (deviceId: string): DeviceRuntimeState => {
    const device = configuredDevices.value.find((item) => item.id === deviceId)
    return ensureDeviceRuntime(device ?? { id: deviceId, address: '' })
  }

  const getOperationForDevice = (deviceId: string): DeviceOperation | null => {
    return deviceOperations.value[deviceId] ?? null
  }

  const isDeviceBusy = (deviceId: string): boolean => {
    return getOperationForDevice(deviceId) !== null
  }

  const isStreamRunningForDevice = (device: DeviceConfig): boolean => {
    return scrcpyStatusByDeviceId.value[device.id]?.running === true
  }

  const addDevice = async (device: NewDeviceConfig): Promise<boolean> => {
    const saved = await appConfig.addDevice(device)
    if (saved) {
      ensureDeviceRuntime(device)
      addEvent({
        level: 'success',
        message: translate('logger.events.deviceAdded', { name: getDeviceLogName(device) }),
        deviceId: device.id
      })
    }
    return saved
  }

  const updateDevice = async (id: string, changes: DeviceConfigUpdate): Promise<boolean> => {
    const saved = await appConfig.updateDevice(id, changes)
    if (saved) {
      const device = configuredDevices.value.find((item) => item.id === id)
      addEvent({
        level: 'success',
        message: translate('logger.events.deviceUpdated', {
          name: device ? getDeviceLogName(device) : 'Device'
        }),
        deviceId: id
      })
    }
    return saved
  }

  const deleteDevice = async (device: DeviceConfig): Promise<boolean> => {
    if (isStreamRunningForDevice(device)) {
      await stopScrcpy(device)
    }
    const saved = await appConfig.deleteDevice(device.id)
    if (saved) {
      removeDeviceRuntime(device.id)
      addEvent({
        level: 'success',
        message: translate('logger.events.deviceDeleted', { name: getDeviceLogName(device) }),
        deviceId: device.id
      })
    }
    return saved
  }

  const resetConfig = async (): Promise<boolean> => {
    const saved = await appConfig.resetConfig()
    if (saved) {
      deviceRuntimeById.value = {}
      deviceOperations.value = {}
      scrcpyStatusByDeviceId.value = {}
    }
    return saved
  }

  const checkEnvironment = async (): Promise<void> => {
    await setGlobalOperation('environment', async () => {
      addEvent({ level: 'info', message: translate('logger.events.environmentCheck') })
      try {
        environment.value = await window.vrControl.headset.checkEnvironment()
        addEvent({
          level: environment.value.adb.available ? 'success' : 'error',
          message: environment.value.adb.available
            ? translate('logger.events.adbFound')
            : translate('logger.events.adbNotFound'),
          description: environment.value.adb.available
            ? (environment.value.adb.version ?? 'ADB version was not detected.')
            : translate('logger.events.adbInstallHint')
        })
        addEvent({
          level: environment.value.scrcpy.available ? 'success' : 'error',
          message: environment.value.scrcpy.available
            ? translate('logger.events.scrcpyFound')
            : translate('logger.events.scrcpyNotFound'),
          description: environment.value.scrcpy.available
            ? (environment.value.scrcpy.version ?? 'scrcpy version was not detected.')
            : translate('logger.events.scrcpyInstallHint')
        })
      } catch (error) {
        console.error('Failed to check environment:', error)
        addEvent(toUserFacingError('environment'))
      }
    })
  }

  const refreshDevices = async (): Promise<void> => {
    if (!isAdbAvailable.value) {
      addEvent({
        level: 'error',
        message: translate('logger.events.adbUnavailable'),
        description: translate('logger.events.runEnvironmentFirst')
      })
      return
    }
    await setGlobalOperation('devices', async () => {
      try {
        const result = await window.vrControl.headset.listAdbDevices()
        adbDevices.value = result.devices
        await Promise.all(configuredDevices.value.map((device) => refreshRuntime(device)))
        addEvent({
          level: 'success',
          message: translate('logger.events.devicesRefreshed'),
          description: translate('logger.events.devicesFound', { count: result.devices.length })
        })
      } catch (error) {
        console.error('Failed to list ADB devices:', error)
        addEvent(toUserFacingError('devices'))
      }
    })
  }

  const refreshRuntime = async (device: DeviceConfig): Promise<void> => {
    await setDeviceOperation(device.id, 'refreshRuntime', async () => {
      const result = await window.vrControl.headset.refreshRuntime(device.id)
      applyRuntime(result.runtime)
    })
  }

  const connectDevice = async (device: DeviceConfig): Promise<void> => {
    if (!isAdbAvailable.value) {
      addEvent({
        level: 'error',
        message: translate('logger.events.adbUnavailable'),
        description: translate('logger.events.runEnvironmentFirst'),
        deviceId: device.id
      })
      return
    }
    await setDeviceOperation(device.id, 'connect', async () => {
      const result = await window.vrControl.headset.connectDevice(device.id)
      applyRuntime(result.runtime)
      addEvent({
        level: result.ok ? 'success' : 'error',
        message: result.ok
          ? translate('logger.events.deviceConnected', { name: getDeviceLogName(device) })
          : translate('logger.events.deviceConnectionFailed', { name: getDeviceLogName(device) }),
        description: result.ok ? undefined : translate('logger.events.connectionTroubleshooting'),
        deviceId: device.id
      })
    })
  }

  const disconnectDevice = async (device: DeviceConfig): Promise<void> => {
    if (!isAdbAvailable.value) {
      addEvent({
        level: 'error',
        message: translate('logger.events.adbUnavailable'),
        description: translate('logger.events.runEnvironmentFirst'),
        deviceId: device.id
      })
      return
    }
    await setDeviceOperation(device.id, 'disconnect', async () => {
      const result = await window.vrControl.headset.disconnectDevice(device.id)
      applyRuntime(result.runtime)
      addEvent({
        level: result.ok ? 'success' : 'error',
        message: result.ok
          ? translate('logger.events.deviceDisconnected', { name: getDeviceLogName(device) })
          : translate('logger.events.deviceDisconnectFailed', { name: getDeviceLogName(device) }),
        description: result.ok ? undefined : translate('logger.events.disconnectTroubleshooting'),
        deviceId: device.id
      })
    })
  }

  const startScrcpy = async (device: DeviceConfig): Promise<void> => {
    if (!isScrcpyAvailable.value) {
      addEvent({
        level: 'error',
        message: translate('logger.events.scrcpyNotFound'),
        description: translate('logger.events.runEnvironmentFirst'),
        deviceId: device.id
      })
      return
    }
    if (getRuntimeForDevice(device.id).connectionState !== 'connected') {
      addEvent({
        level: 'warning',
        message: translate('logger.events.deviceConnectionFailed', { name: getDeviceLogName(device) }),
        description: translate('logger.events.connectBeforeStream'),
        deviceId: device.id
      })
      return
    }
    await setDeviceOperation(device.id, 'startScrcpy', async () => {
      const result = await window.vrControl.headset.startScrcpy(device.id)
      scrcpyStatusByDeviceId.value = { ...scrcpyStatusByDeviceId.value, [device.id]: result.status }
      addEvent({
        level: result.ok ? 'success' : 'error',
        message: result.ok
          ? translate('logger.events.streamStarted', { name: getDeviceLogName(device) })
          : translate('logger.events.streamStartFailed', { name: getDeviceLogName(device) }),
        description: result.ok ? undefined : translate('logger.events.streamStartTroubleshooting'),
        deviceId: device.id
      })
    })
  }

  const stopScrcpy = async (device: DeviceConfig): Promise<void> => {
    await setDeviceOperation(device.id, 'stopScrcpy', async () => {
      const result = await window.vrControl.headset.stopScrcpy(device.id)
      scrcpyStatusByDeviceId.value = { ...scrcpyStatusByDeviceId.value, [device.id]: result.status }
      addEvent({
        level: result.ok ? 'success' : 'error',
        message: result.ok
          ? translate('logger.events.streamStopRequested', { name: getDeviceLogName(device) })
          : translate('logger.events.streamStopFailed', { name: getDeviceLogName(device) }),
        description: result.ok ? undefined : translate('logger.events.streamStopTroubleshooting'),
        deviceId: device.id
      })
    })
  }

  const onScrcpyEvent = (event: ScrcpyProcessEvent): void => {
    if (!event.deviceId) return
    scrcpyStatusByDeviceId.value = { ...scrcpyStatusByDeviceId.value, [event.deviceId]: event.status }
    if (event.type === 'exit' || event.type === 'error') {
      const device = configuredDevices.value.find((item) => item.id === event.deviceId)
      addEvent({
        level: event.status.state === 'error' ? 'error' : 'info',
        message:
          event.status.state === 'error'
            ? translate('logger.events.streamExitedError', {
                name: device ? getDeviceLogName(device) : 'Device'
              })
            : translate('logger.events.streamStopped', {
                name: device ? getDeviceLogName(device) : 'Device'
              }),
        description:
          event.status.state === 'error' ? translate('logger.events.technicalLogsHint') : undefined,
        deviceId: event.deviceId
      })
    }
  }

  const onRuntimeEvent = (event: DeviceRuntimeEvent): void => {
    applyRuntime(event.runtime)
  }

  const initialize = async (): Promise<void> => {
    if (isInitialized) return
    isInitialized = true
    await appConfig.loadConfig()
    for (const device of configuredDevices.value) ensureDeviceRuntime(device)
    unsubscribeScrcpy = window.vrControl.headset.onScrcpyEvent(onScrcpyEvent)
    unsubscribeRuntime = window.vrControl.headset.onRuntimeEvent(onRuntimeEvent)
    await Promise.all([refreshAppDiagnostics(), checkEnvironment()])
    await Promise.all(configuredDevices.value.map((device) => refreshRuntime(device)))
  }

  const dispose = (): void => {
    unsubscribeScrcpy?.()
    unsubscribeRuntime?.()
    unsubscribeScrcpy = null
    unsubscribeRuntime = null
    isInitialized = false
  }

  return {
    environment,
    adbDevices,
    appInfo,
    technicalLogInfo,
    config: appConfig.config,
    configFile: appConfig.file,
    configuredDevices,
    streamProfiles,
    activeDevice: appConfig.activeDevice,
    activeStreamProfile: appConfig.activeStreamProfile,
    configError: appConfig.error,
    isConfigLoading: appConfig.isLoading,
    operation,
    deviceOperations,
    deviceRuntimeById,
    scrcpyStatus: computed(() => Object.values(scrcpyStatusByDeviceId.value)[0] ?? null),
    isBusy,
    isAdbAvailable,
    isScrcpyAvailable,
    isScrcpyRunning,
    initialize,
    dispose,
    addDevice,
    updateDevice,
    deleteDevice,
    addStreamProfile: appConfig.addStreamProfile,
    updateStreamProfile: appConfig.updateStreamProfile,
    deleteStreamProfile: appConfig.deleteStreamProfile,
    resetConfig,
    refreshAppDiagnostics,
    checkEnvironment,
    refreshDevices,
    refreshRuntime,
    getRuntimeForDevice,
    getOperationForDevice,
    getStreamProfileForDevice,
    isDeviceBusy,
    isStreamRunningForDevice,
    connectDevice,
    disconnectDevice,
    startScrcpy,
    stopScrcpy
  }
}
