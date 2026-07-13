import { computed, ref } from 'vue'
import type { AppInfo, TechnicalLogInfo } from '../../../shared/contracts/app.contracts'
import type {
  AdbDevice,
  EnvironmentCheck,
  ScrcpyProcessEvent,
  ScrcpyStatus
} from '../../../shared/contracts/headset.contracts'
import { toUserFacingError } from './event-log.model'
import { useEventLog } from './useEventLog'

type Operation =
  | 'environment'
  | 'devices'
  | 'connect'
  | 'disconnect'
  | 'startScrcpy'
  | 'stopScrcpy'
  | null

const environment = ref<EnvironmentCheck | null>(null)
const devices = ref<AdbDevice[]>([])
const appInfo = ref<AppInfo | null>(null)
const technicalLogInfo = ref<TechnicalLogInfo | null>(null)
const address = ref('192.168.1.100:5555')
const crop = ref('')
const noAudio = ref(true)
const operation = ref<Operation>(null)
const adbConnectionState = ref<'unknown' | 'connected' | 'disconnected' | 'error'>('unknown')
const adbConnectionMessage = ref('Run device discovery or connect to update ADB state.')
const scrcpyStatus = ref<ScrcpyStatus | null>(null)
let isInitialized = false
let unsubscribeScrcpy: (() => void) | null = null

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
  const { addEvent } = useEventLog()

  if (!trimmedAddress) {
    adbConnectionState.value = 'error'
    adbConnectionMessage.value = 'Device address is required.'
    addEvent({
      level: 'error',
      message: 'Адрес шлема не указан.',
      description: 'Введите адрес в формате IP:port.'
    })
    return null
  }

  return trimmedAddress
}

const addScrcpyEventToLog = (event: ScrcpyProcessEvent): void => {
  const { addEvent } = useEventLog()

  if (event.type === 'error') {
    addEvent({
      level: 'error',
      message: 'scrcpy завершился с ошибкой.',
      description: 'Технические подробности записаны в файл логов.',
      deviceId: event.status.address ?? undefined
    })
    return
  }

  if (event.type === 'exit') {
    addEvent({
      level: event.status.state === 'error' ? 'error' : 'info',
      message: event.status.state === 'error' ? 'Трансляция завершилась с ошибкой.' : 'Трансляция остановлена.',
      description:
        event.status.state === 'error'
          ? 'Проверьте устройство, ADB-подключение и технические логи.'
          : undefined,
      deviceId: event.status.address ?? undefined
    })
  }
}

export const useHeadsetController = () => {
  const { addEvent } = useEventLog()

  const isBusy = computed(() => operation.value !== null)
  const isAdbAvailable = computed(() => environment.value?.adb.available === true)
  const isScrcpyAvailable = computed(() => environment.value?.scrcpy.available === true)
  const isScrcpyRunning = computed(() => scrcpyStatus.value?.running === true)

  const matchingDevice = computed(() => {
    const trimmedAddress = address.value.trim()
    return devices.value.find((device) => device.serial === trimmedAddress) ?? null
  })

  const refreshAppDiagnostics = async (): Promise<void> => {
    appInfo.value = await window.arena.getAppInfo()
    technicalLogInfo.value = await window.arena.getTechnicalLogInfo()
  }

  const refreshScrcpyStatus = async (): Promise<void> => {
    scrcpyStatus.value = await window.arena.headset.getScrcpyStatus()
  }

  const checkEnvironment = async (): Promise<void> => {
    await setOperation('environment', async () => {
      addEvent({ level: 'info', message: 'Проверка ADB и scrcpy.' })

      try {
        environment.value = await window.arena.headset.checkEnvironment()
        addEvent({
          level: environment.value.adb.available ? 'success' : 'error',
          message: environment.value.adb.available ? 'ADB найден.' : 'ADB не найден.',
          description: environment.value.adb.available
            ? (environment.value.adb.version ?? 'Версия ADB не определена.')
            : 'Проверьте установку ADB и переменную PATH.'
        })
        addEvent({
          level: environment.value.scrcpy.available ? 'success' : 'error',
          message: environment.value.scrcpy.available ? 'scrcpy найден.' : 'scrcpy не найден.',
          description: environment.value.scrcpy.available
            ? (environment.value.scrcpy.version ?? 'Версия scrcpy не определена.')
            : 'Проверьте установку scrcpy и переменную PATH.'
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
        message: 'ADB недоступен.',
        description: 'Сначала выполните проверку окружения.'
      })
      return
    }

    await setOperation('devices', async () => {
      addEvent({ level: 'info', message: 'Обновление списка ADB-устройств.' })

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

        addEvent({
          level: 'success',
          message: 'Список устройств обновлён.',
          description: `Найдено устройств: ${result.devices.length}.`
        })
      } catch (error) {
        console.error('Failed to list ADB devices:', error)
        adbConnectionState.value = 'error'
        adbConnectionMessage.value = 'Unable to list ADB devices.'
        addEvent(toUserFacingError('devices'))
      }
    })
  }

  const connectDevice = async (): Promise<void> => {
    const targetAddress = getRequiredAddress()
    if (!targetAddress) {
      return
    }

    if (!isAdbAvailable.value) {
      addEvent({
        level: 'error',
        message: 'ADB недоступен.',
        description: 'Сначала выполните проверку окружения.'
      })
      return
    }

    await setOperation('connect', async () => {
      addEvent({
        level: 'info',
        message: 'Подключение шлема через ADB.',
        deviceId: targetAddress
      })

      try {
        const result = await window.arena.headset.connectDevice(targetAddress)
        adbConnectionState.value = result.ok ? 'connected' : 'error'
        adbConnectionMessage.value = result.ok ? 'ADB connection established.' : 'ADB connection failed.'
        addEvent({
          level: result.ok ? 'success' : 'error',
          message: result.ok ? 'Шлем подключён.' : 'Не удалось подключить шлем.',
          description: result.ok
            ? undefined
            : 'Проверьте IP-адрес, питание устройства и подключение к сети.',
          deviceId: targetAddress
        })
        await refreshDevices()
      } catch (error) {
        console.error('Failed to connect ADB device:', error)
        adbConnectionState.value = 'error'
        adbConnectionMessage.value = 'ADB connect failed.'
        addEvent({ ...toUserFacingError('connect'), deviceId: targetAddress })
      }
    })
  }

  const disconnectDevice = async (): Promise<void> => {
    const targetAddress = getRequiredAddress()
    if (!targetAddress) {
      return
    }

    if (!isAdbAvailable.value) {
      addEvent({
        level: 'error',
        message: 'ADB недоступен.',
        description: 'Сначала выполните проверку окружения.'
      })
      return
    }

    await setOperation('disconnect', async () => {
      addEvent({
        level: 'info',
        message: 'Отключение шлема от ADB.',
        deviceId: targetAddress
      })

      try {
        const result = await window.arena.headset.disconnectDevice(targetAddress)
        adbConnectionState.value = result.ok ? 'disconnected' : 'error'
        adbConnectionMessage.value = result.ok ? 'ADB device disconnected.' : 'ADB disconnect failed.'
        addEvent({
          level: result.ok ? 'success' : 'error',
          message: result.ok ? 'Шлем отключён.' : 'Не удалось отключить шлем.',
          description: result.ok ? undefined : 'Проверьте состояние ADB и повторите попытку.',
          deviceId: targetAddress
        })
        await refreshDevices()
      } catch (error) {
        console.error('Failed to disconnect ADB device:', error)
        adbConnectionState.value = 'error'
        adbConnectionMessage.value = 'ADB disconnect failed.'
        addEvent({ ...toUserFacingError('disconnect'), deviceId: targetAddress })
      }
    })
  }

  const startScrcpy = async (): Promise<void> => {
    const targetAddress = getRequiredAddress()
    if (!targetAddress) {
      return
    }

    if (!isScrcpyAvailable.value) {
      addEvent({
        level: 'error',
        message: 'scrcpy недоступен.',
        description: 'Сначала выполните проверку окружения.'
      })
      return
    }

    if (isScrcpyRunning.value) {
      addEvent({
        level: 'warning',
        message: 'Трансляция уже запущена.',
        deviceId: scrcpyStatus.value?.address ?? targetAddress
      })
      return
    }

    await setOperation('startScrcpy', async () => {
      addEvent({
        level: 'info',
        message: 'Запуск трансляции.',
        deviceId: targetAddress
      })

      try {
        const result = await window.arena.headset.startScrcpy({
          address: targetAddress,
          crop: crop.value,
          noAudio: noAudio.value
        })
        scrcpyStatus.value = result.status
        addEvent({
          level: result.ok ? 'success' : 'error',
          message: result.ok ? 'Трансляция запущена.' : 'Не удалось запустить трансляцию.',
          description: result.ok ? undefined : 'Проверьте scrcpy, ADB-подключение и параметры запуска.',
          deviceId: targetAddress
        })
      } catch (error) {
        console.error('Failed to start scrcpy:', error)
        addEvent({ ...toUserFacingError('startStream'), deviceId: targetAddress })
      }
    })
  }

  const stopScrcpy = async (): Promise<void> => {
    if (!isScrcpyRunning.value) {
      addEvent({
        level: 'warning',
        message: 'Трансляция не запущена.'
      })
      return
    }

    await setOperation('stopScrcpy', async () => {
      addEvent({
        level: 'info',
        message: 'Остановка трансляции.',
        deviceId: scrcpyStatus.value?.address ?? undefined
      })

      try {
        const result = await window.arena.headset.stopScrcpy()
        scrcpyStatus.value = result.status
        addEvent({
          level: result.ok ? 'success' : 'error',
          message: result.ok ? 'Запрошена остановка трансляции.' : 'Не удалось остановить трансляцию.',
          description: result.ok ? undefined : 'Проверьте состояние процесса scrcpy.',
          deviceId: result.status.address ?? undefined
        })
      } catch (error) {
        console.error('Failed to stop scrcpy:', error)
        addEvent(toUserFacingError('stopStream'))
      }
    })
  }

  const initialize = async (): Promise<void> => {
    if (isInitialized) {
      return
    }

    isInitialized = true
    unsubscribeScrcpy = window.arena.headset.onScrcpyEvent((event) => {
      scrcpyStatus.value = event.status
      addScrcpyEventToLog(event)
    })

    await Promise.all([refreshScrcpyStatus(), refreshAppDiagnostics(), checkEnvironment()])
  }

  const dispose = (): void => {
    unsubscribeScrcpy?.()
    unsubscribeScrcpy = null
    isInitialized = false
  }

  return {
    environment,
    devices,
    appInfo,
    technicalLogInfo,
    address,
    crop,
    noAudio,
    operation,
    adbConnectionState,
    adbConnectionMessage,
    scrcpyStatus,
    isBusy,
    isAdbAvailable,
    isScrcpyAvailable,
    isScrcpyRunning,
    matchingDevice,
    initialize,
    dispose,
    refreshAppDiagnostics,
    checkEnvironment,
    refreshDevices,
    connectDevice,
    disconnectDevice,
    startScrcpy,
    stopScrcpy
  }
}
