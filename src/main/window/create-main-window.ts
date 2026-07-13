import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { logger } from '../logger/logger'

export const createMainWindow = (): BrowserWindow => {
  logger.info('Creating main window')
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'VR Control Center',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    logger.debug('Main window ready to show')
    mainWindow.show()

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.debug('Opening external URL from renderer', { url })
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    logger.info('Main window closed')
  })

  return mainWindow
}
