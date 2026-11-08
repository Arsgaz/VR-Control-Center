import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { app, nativeImage } from 'electron'

export const initializeApplicationIdentity = (): void => {
  // A display-name change must not move existing configuration, icons or logs.
  const userData = app.getPath('userData')
  const logs = app.getPath('logs')
  mkdirSync(userData, { recursive: true })
  mkdirSync(logs, { recursive: true })
  app.setName('VR Control Center')
  app.setPath('userData', userData)
  app.setPath('logs', logs)
  if (process.platform === 'win32') app.setAppUserModelId('com.vrcontrolcenter.desktop')
}

export const brandingPath = (file: string): string =>
  join(
    app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
    'branding',
    file
  )

export const applyApplicationBranding = (): void => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(brandingPath('icon.png')))
  }
}
