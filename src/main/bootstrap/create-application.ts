import { app, BrowserWindow } from 'electron'
import {
  applyLoggerSettings,
  configureLogger,
  logger
} from '@main/infrastructure/logging/logger'
import { migrateLegacyApplicationData } from '@main/migrations/app-name-migration'
import { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import {
  HEADSET_IPC_CHANNELS,
  type DeviceRuntimeEvent,
  type ScrcpyProcessEvent
} from '@shared/contracts/headset.contracts'
import { registerIpc } from './register-ipc'
import { registerApplicationLifecycle } from './lifecycle'
import { createMainWindow } from './create-main-window'

const broadcastRuntimeEvent = (event: DeviceRuntimeEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(HEADSET_IPC_CHANNELS.runtimeEvent, event)
  }
}

export const createApplication = async (): Promise<void> => {
  const logInfo = configureLogger()
  logger.info('Application starting', {
    appName: 'VR Control Center',
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    logFile: logInfo.file
  })

  const configurationService = new ConfigurationService()

  const broadcastScrcpyEvent = (event: ScrcpyProcessEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(HEADSET_IPC_CHANNELS.scrcpyEvent, event)
    }
    void runtimeManager.handleScrcpyEvent(event)
  }

  const scrcpyService = new ScrcpyService(broadcastScrcpyEvent)
  const runtimeManager = new HeadsetRuntimeManager(
    broadcastRuntimeEvent,
    scrcpyService,
    configurationService
  )

  await migrateLegacyApplicationData()
  const configState = await configurationService.load()
  applyLoggerSettings(configState.config.settings.logLevel, configState.config.settings.verboseLogging)

  registerIpc({
    configurationService,
    runtimeManager,
    scrcpyService
  })
  registerApplicationLifecycle({
    runtimeManager,
    scrcpyService
  })

  await runtimeManager.initialize()
  createMainWindow()
  logger.info('Application ready')
}
