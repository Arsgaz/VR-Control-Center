import { BrowserWindow, ipcMain } from 'electron'
import {
  HEADSET_IPC_CHANNELS,
  type ScrcpyProcessEvent,
  type ScrcpyStartOptions
} from '../../shared/contracts/headset.contracts'
import {
  checkAdb,
  connectAdbDevice,
  disconnectAdbDevice,
  listAdbDevices
} from '../tools/adb.service'
import { checkScrcpy, ScrcpyService } from '../tools/scrcpy.service'
import { logger } from '../logger/logger'

const assertAddress = (address: string): string => {
  const trimmed = address.trim()
  if (!trimmed) {
    throw new Error('Device address is required')
  }

  return trimmed
}

const broadcastScrcpyEvent = (event: ScrcpyProcessEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(HEADSET_IPC_CHANNELS.scrcpyEvent, event)
  }
}

const scrcpyService = new ScrcpyService(broadcastScrcpyEvent)

export const registerHeadsetHandlers = (): void => {
  ipcMain.handle(HEADSET_IPC_CHANNELS.checkEnvironment, async () => {
    try {
      logger.debug('IPC headset:check-environment started')
      const [adb, scrcpy] = await Promise.all([checkAdb(), checkScrcpy()])
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
      const result = await listAdbDevices()
      logger.debug('IPC headset:list-adb-devices completed', { count: result.devices.length })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:list-adb-devices failed', error)
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.connectDevice, async (_, address: string) => {
    try {
      const assertedAddress = assertAddress(address)
      logger.debug('IPC headset:connect-device started', { address: assertedAddress })
      const result = await connectAdbDevice(assertedAddress)
      logger.debug('IPC headset:connect-device completed', { address: assertedAddress, ok: result.ok })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:connect-device failed', error, { address })
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.disconnectDevice, async (_, address: string) => {
    try {
      const assertedAddress = assertAddress(address)
      logger.debug('IPC headset:disconnect-device started', { address: assertedAddress })
      const result = await disconnectAdbDevice(assertedAddress)
      logger.debug('IPC headset:disconnect-device completed', {
        address: assertedAddress,
        ok: result.ok
      })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:disconnect-device failed', error, { address })
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.startScrcpy, (_, options: ScrcpyStartOptions) => {
    try {
      const address = assertAddress(options.address)
      logger.debug('IPC headset:start-scrcpy started', {
        address,
        noAudio: options.noAudio,
        hasCrop: Boolean(options.crop?.trim())
      })
      const result = scrcpyService.start({
        ...options,
        address,
        crop: options.crop?.trim()
      })
      logger.debug('IPC headset:start-scrcpy completed', { address, ok: result.ok })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:start-scrcpy failed', error, {
        address: options.address
      })
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.stopScrcpy, () => {
    try {
      logger.debug('IPC headset:stop-scrcpy started')
      const result = scrcpyService.stop()
      logger.debug('IPC headset:stop-scrcpy completed', { ok: result.ok })
      return result
    } catch (error) {
      logger.errorWithCause('IPC headset:stop-scrcpy failed', error)
      throw error
    }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.getScrcpyStatus, () => {
    const status = scrcpyService.getStatus()
    logger.debug('IPC headset:get-scrcpy-status completed', {
      state: status.state,
      running: status.running
    })
    return status
  })
}

export const stopScrcpyOnShutdown = (): void => {
  logger.debug('Stopping scrcpy from shutdown hook')
  scrcpyService.stopOnShutdown()
}
