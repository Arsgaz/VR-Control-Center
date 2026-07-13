import { app, ipcMain } from 'electron'
import { APP_IPC_CHANNELS, type AppInfo } from '../../shared/contracts/app.contracts'

const normalizePlatform = (platform: NodeJS.Platform): AppInfo['platform'] => {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }

  return 'linux'
}

export const registerAppHandlers = (): void => {
  ipcMain.handle(APP_IPC_CHANNELS.getAppInfo, (): AppInfo => {
    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      platform: normalizePlatform(process.platform),
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node
    }
  })
}
