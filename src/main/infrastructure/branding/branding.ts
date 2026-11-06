import { join } from 'node:path'
import { app, nativeImage } from 'electron'

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
