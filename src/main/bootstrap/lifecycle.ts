import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './create-main-window'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import { logger } from '@main/infrastructure/logging/logger'

export interface LifecycleDependencies {
  runtimeManager: HeadsetRuntimeManager
  scrcpyService: ScrcpyService
}

export const registerApplicationLifecycle = ({
  runtimeManager,
  scrcpyService
}: LifecycleDependencies): void => {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Recreating main window after activate')
      createMainWindow()
    }
  })

  app.on('before-quit', () => {
    logger.info('Application before-quit; stopping child processes')
    runtimeManager.shutdown()
    scrcpyService.stopOnShutdown()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      logger.info('All windows closed; quitting application')
      app.quit()
    }
  })
}
