import { app, BrowserWindow } from 'electron'
import { registerAppHandlers } from './ipc/app.handlers'
import { registerHeadsetHandlers, stopScrcpyOnShutdown } from './ipc/headset.handlers'
import { createMainWindow } from './window/create-main-window'

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.arenacontrol.desktop')
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
  registerHeadsetHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  stopScrcpyOnShutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
