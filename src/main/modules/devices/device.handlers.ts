import { UsbConnectionService } from '@main/infrastructure/adb/usb-connection.service'
import { ipcMain } from 'electron'
import { HEADSET_IPC_CHANNELS } from '@shared/contracts/headset.contracts'
import { checkAdb, listAdbDevices } from '@main/infrastructure/adb/adb.service'
import { checkScrcpy } from '@main/infrastructure/scrcpy/scrcpy.service'
import { createBinaryResolverFromSettings } from '@main/infrastructure/binaries/binary-resolver'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { HeadsetRuntimeManager } from './device-runtime.manager'
import { logger } from '@main/infrastructure/logging/logger'

export const assertDeviceId = (deviceId: string): string => {
  const trimmed = deviceId.trim()
  if (!trimmed) {
    throw new Error('Device id is required')
  }
  return trimmed
}

interface DeviceHandlerDependencies {
  configurationService: ConfigurationService
  runtimeManager: HeadsetRuntimeManager
}

export const registerDeviceHandlers = ({
  configurationService,
  runtimeManager
}: DeviceHandlerDependencies): void => {
  const usbConnection = new UsbConnectionService()
  ipcMain.handle(HEADSET_IPC_CHANNELS.connectUsb, async (_, serial?: unknown) => {
    const state = await configurationService.load()
    return usbConnection.connect(createBinaryResolverFromSettings(state.config.settings), serial)
  })

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
    return runtimeManager.connect(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.disconnectDevice, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:disconnect-device started', { deviceId: assertedDeviceId })
    return runtimeManager.disconnect(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.refreshRuntime, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:refresh-runtime started', { deviceId: assertedDeviceId })
    return runtimeManager.refreshRuntime(assertedDeviceId)
  })
  ipcMain.handle(HEADSET_IPC_CHANNELS.syncTime, (_, deviceId: string) =>
    runtimeManager.syncTime(assertDeviceId(deviceId))
  )
}
