import { BrowserWindow, ipcMain } from 'electron'
import {
  HEADSET_IPC_CHANNELS,
  type DeviceRuntimeEvent,
  type ScrcpyProcessEvent
} from '../../shared/contracts/headset.contracts'
import { checkAdb, listAdbDevices } from '../tools/adb.service'
import { checkScrcpy, ScrcpyService } from '../tools/scrcpy.service'
import { createBinaryResolverFromSettings } from '../tools/binary-resolver'
import { HeadsetRuntimeManager } from '../runtime/headset-runtime.manager'
import { logger } from '../logger/logger'
import { configurationService } from '../config/configuration.service'

const assertDeviceId = (deviceId: string): string => {
  const trimmed = deviceId.trim()
  if (!trimmed) {
    throw new Error('Device id is required')
  }
  return trimmed
}

const broadcastScrcpyEvent = (event: ScrcpyProcessEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(HEADSET_IPC_CHANNELS.scrcpyEvent, event)
  }
  void runtimeManager?.handleScrcpyEvent(event)
}

const broadcastRuntimeEvent = (event: DeviceRuntimeEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(HEADSET_IPC_CHANNELS.runtimeEvent, event)
  }
}

const scrcpyService = new ScrcpyService(broadcastScrcpyEvent)
let runtimeManager: HeadsetRuntimeManager | null = null

const getRuntimeManager = (): HeadsetRuntimeManager => {
  if (!runtimeManager) {
    runtimeManager = new HeadsetRuntimeManager(broadcastRuntimeEvent, scrcpyService)
  }
  return runtimeManager
}

export const initializeHeadsetRuntime = async (): Promise<void> => {
  await getRuntimeManager().initialize()
}

export const registerHeadsetHandlers = (): void => {
  const manager = getRuntimeManager()

  ipcMain.handle(HEADSET_IPC_CHANNELS.checkEnvironment, async () => {
    try {
      logger.debug('IPC headset:check-environment started')
      const state = await configurationService.load()
      const resolver = createBinaryResolverFromSettings(state.config.settings)
      const [adb, scrcpy] = await Promise.all([checkAdb(resolver), checkScrcpy(resolver)])
      logger.debug('IPC headset:check-environment completed', {
        adbAvailable: adb.available,
        scrcpyAvailable: scrcpy.available
      })
      return { adb, scrcpy }
    } catch (error) {
      logger.errorWithCause('IPC headset:check-environment failed', error)
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.listAdbDevices, async () => {
    try {
      logger.debug('IPC headset:list-adb-devices started')
      const state = await configurationService.load()
      const result = await listAdbDevices(createBinaryResolverFromSettings(state.config.settings))
      logger.debug('IPC headset:list-adb-devices completed', { count: result.devices.length })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:list-adb-devices failed', error)
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.connectDevice, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:connect-device started', { deviceId: assertedDeviceId })
    return manager.connect(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.disconnectDevice, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:disconnect-device started', { deviceId: assertedDeviceId })
    return manager.disconnect(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.refreshRuntime, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:refresh-runtime started', { deviceId: assertedDeviceId })
    return manager.refreshRuntime(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.startScrcpy, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:start-scrcpy started', { deviceId: assertedDeviceId })
    return manager.startStream(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.stopScrcpy, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:stop-scrcpy started', { deviceId: assertedDeviceId })
    return manager.stopStream(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.getScrcpyStatus, (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    const status = scrcpyService.getStatus(assertedDeviceId)
    logger.debug('IPC headset:get-scrcpy-status completed', {
      deviceId: assertedDeviceId,
      state: status.state,
      running: status.running
    })
    return status
  })
}

export const stopScrcpyOnShutdown = (): void => {
  logger.debug('Stopping headset runtime from shutdown hook')
  runtimeManager?.shutdown()
  scrcpyService.stopOnShutdown()
}
