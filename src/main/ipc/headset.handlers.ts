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
    const [adb, scrcpy] = await Promise.all([checkAdb(), checkScrcpy()])
    return { adb, scrcpy }
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.listAdbDevices, async () => {
    return listAdbDevices()
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.connectDevice, async (_, address: string) => {
    return connectAdbDevice(assertAddress(address))
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.disconnectDevice, async (_, address: string) => {
    return disconnectAdbDevice(assertAddress(address))
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.startScrcpy, (_, options: ScrcpyStartOptions) => {
    const address = assertAddress(options.address)
    return scrcpyService.start({
      ...options,
      address,
      crop: options.crop?.trim()
    })
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.stopScrcpy, () => {
    return scrcpyService.stop()
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.getScrcpyStatus, () => {
    return scrcpyService.getStatus()
  })
}

export const stopScrcpyOnShutdown = (): void => {
  scrcpyService.stopOnShutdown()
}
