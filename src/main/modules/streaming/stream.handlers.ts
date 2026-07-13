import { ipcMain } from 'electron'
import { HEADSET_IPC_CHANNELS } from '@shared/contracts/headset.contracts'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import { logger } from '@main/infrastructure/logging/logger'
import { assertDeviceId } from '@main/modules/devices/device.handlers'

interface StreamHandlerDependencies {
  runtimeManager: HeadsetRuntimeManager
  scrcpyService: ScrcpyService
}

export const registerStreamHandlers = ({
  runtimeManager,
  scrcpyService
}: StreamHandlerDependencies): void => {
  ipcMain.handle(HEADSET_IPC_CHANNELS.startScrcpy, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:start-scrcpy started', { deviceId: assertedDeviceId })
    return runtimeManager.startStream(assertedDeviceId)
  })

  ipcMain.handle(HEADSET_IPC_CHANNELS.stopScrcpy, async (_, deviceId: string) => {
    const assertedDeviceId = assertDeviceId(deviceId)
    logger.debug('IPC headset:stop-scrcpy started', { deviceId: assertedDeviceId })
    return runtimeManager.stopStream(assertedDeviceId)
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
