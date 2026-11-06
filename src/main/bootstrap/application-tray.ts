import { app, Menu, nativeImage, Tray } from 'electron'
import { brandingPath } from '@main/infrastructure/branding/branding'
import { logger } from '@main/infrastructure/logging/logger'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'

export interface ApplicationTray {
  destroy: () => void
}

export const createApplicationTray = (
  configuration: ConfigurationService,
  showWindow: () => void
): ApplicationTray | null => {
  try {
    const icon = nativeImage.createFromPath(
      brandingPath(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
    )
    if (icon.isEmpty()) throw new Error('Tray icon is missing')
    if (process.platform === 'darwin') icon.setTemplateImage(true)
    const tray = new Tray(icon)
    tray.setToolTip('OnePlace · VR Control Center')
    const updateMenu = (): void => {
      const russian = configuration.get().config.settings.language === 'ru'
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'OnePlace · VR Control Center', enabled: false },
          { type: 'separator' },
          { label: russian ? 'Открыть приложение' : 'Open application', click: showWindow },
          { label: russian ? 'Выйти' : 'Quit', click: () => app.quit() }
        ])
      )
    }
    updateMenu()
    const unsubscribe = configuration.onDidChange(updateMenu)
    if (process.platform !== 'darwin') tray.on('click', showWindow)
    tray.on('double-click', showWindow)
    logger.info('OnePlace system tray created')
    return {
      destroy: () => {
        unsubscribe()
        if (!tray.isDestroyed()) tray.destroy()
      }
    }
  } catch (error) {
    logger.errorWithCause('Could not create system tray', error)
    return null
  }
}
