import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron'
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
    const createIcon = () => {
      const filename =
        process.platform === 'darwin'
          ? 'trayTemplate.png'
          : process.platform === 'win32' && !nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
            ? 'tray-light.png'
            : 'tray.png'
      const icon = nativeImage.createFromPath(brandingPath(filename))
      if (icon.isEmpty()) throw new Error('Tray icon is missing')
      if (process.platform === 'darwin') icon.setTemplateImage(true)
      return icon
    }
    const tray = new Tray(createIcon())
    const updateIcon = (): void => {
      try {
        tray.setImage(createIcon())
      } catch (error) {
        logger.errorWithCause('Could not update system tray icon', error)
      }
    }
    if (process.platform === 'win32') nativeTheme.on('updated', updateIcon)
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
        if (process.platform === 'win32') nativeTheme.off('updated', updateIcon)
        if (!tray.isDestroyed()) tray.destroy()
      }
    }
  } catch (error) {
    logger.errorWithCause('Could not create system tray', error)
    return null
  }
}
