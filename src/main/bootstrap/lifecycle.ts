import { createApplicationTray } from './application-tray'
import { app, BrowserWindow, dialog } from 'electron'
import { createMainWindow } from './create-main-window'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import { logger } from '@main/infrastructure/logging/logger'

export interface LifecycleDependencies {
  runtimeManager: HeadsetRuntimeManager
  scrcpyService: ScrcpyService
  configurationService: ConfigurationService
}

export const registerApplicationLifecycle = ({
  runtimeManager,
  scrcpyService,
  configurationService
}: LifecycleDependencies): void => {
  let quitting = false
  const updateBackgroundMode = (): void => {
    if (quitting) return
    runtimeManager.setBackgroundMode(
      !BrowserWindow.getAllWindows().some(
        (window) => !window.isDestroyed() && window.isVisible() && !window.isMinimized()
      )
    )
  }
  const showMainWindow = (): void => {
    const window = BrowserWindow.getAllWindows()[0] ?? createMainWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  const tray = createApplicationTray(configurationService, showMainWindow)

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vrcontrolcenter.desktop')
  }

  app.on('browser-window-created', (_, window) => {
    window.on('show', updateBackgroundMode)
    window.on('hide', updateBackgroundMode)
    window.on('minimize', updateBackgroundMode)
    window.on('restore', updateBackgroundMode)
    window.on('closed', updateBackgroundMode)
    updateBackgroundMode()
    let closeDialogPending = false
    window.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      if (closeDialogPending) return
      const settings = configurationService.get().config.settings
      if (settings.closeBehavior === 'minimizeToTray' && tray) {
        window.hide()
        return
      }
      if (settings.closeBehavior !== 'ask') {
        app.quit()
        return
      }
      const russian = settings.language === 'ru'
      closeDialogPending = true
      void dialog
        .showMessageBox(window, {
          type: 'question',
          title: 'VR Control Center',
          message: russian ? 'Закрыть приложение?' : 'Quit the application?',
          detail: russian ? 'Все трансляции будут остановлены.' : 'All streams will be stopped.',
          buttons: russian ? ['Отмена', 'Закрыть'] : ['Cancel', 'Quit'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })
        .then(({ response }) => {
          if (response === 1 && !quitting) app.quit()
        })
        .catch((error) => {
          logger.errorWithCause('Close confirmation failed', error)
        })
        .finally(() => {
          closeDialogPending = false
        })
    })

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

  app.on('activate', showMainWindow)

  app.on('before-quit', () => {
    quitting = true
    tray?.destroy()
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
