import { app, BrowserWindow } from 'electron'
import { registerAppHandlers } from './ipc/app.handlers'
import { registerConfigHandlers } from './ipc/config.handlers'
import {
  initializeHeadsetRuntime,
  registerHeadsetHandlers,
  stopScrcpyOnShutdown
} from './ipc/headset.handlers'
import { applyLoggerSettings, configureLogger, logger } from './logger/logger'
import { createMainWindow } from './window/create-main-window'
import { configurationService } from './config/configuration.service'
import { migrateLegacyApplicationData } from './migration/app-name-migration'

app.whenReady().then(async () => {
  const logInfo = configureLogger()
  logger.info('Application starting', {
    appName: 'VR Control Center',
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    logFile: logInfo.file
  })

  await migrateLegacyApplicationData()
  const configState = await configurationService.load()
  applyLoggerSettings(configState.config.settings.logLevel, configState.config.settings.verboseLogging)

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vrcontrolcenter.desktop')
  }

  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (app.isPackaged && input.type === 'keyDown') {
        const isReload = input.code === 'KeyR' && (input.control || input.meta)
        const isDevTools =
          input.code === 'KeyI' && (input.alt || input.control) && (input.meta || input.shift)

        if (isReload || isDevTools) {
          event.preventDefault()
        }
      }
    })
  })

  registerAppHandlers()
  registerConfigHandlers()
  registerHeadsetHandlers()
  await initializeHeadsetRuntime()
  createMainWindow()
  logger.info('Application ready')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Recreating main window after activate')
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  logger.info('Application before-quit; stopping child processes')
  stopScrcpyOnShutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logger.info('All windows closed; quitting application')
    app.quit()
  }
})
