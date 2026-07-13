import { app, ipcMain } from 'electron'
import {
  APP_IPC_CHANNELS,
  type AppInfo,
  type TechnicalLogInfo
} from '../../shared/contracts/app.contracts'
import { getTechnicalLogInfo, logger } from '../logger/logger'

const normalizePlatform = (platform: NodeJS.Platform): AppInfo['platform'] => {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }

  return 'linux'
}

export const registerAppHandlers = (): void => {
  ipcMain.handle(APP_IPC_CHANNELS.getAppInfo, (): AppInfo => {
    const appInfo = {
      appName: 'VR Control Center',
      appVersion: app.getVersion(),
      platform: normalizePlatform(process.platform),
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node
    }
    logger.debug('IPC app:get-info completed', { platform: appInfo.platform, arch: appInfo.arch })
    return appInfo
  })

  ipcMain.handle(APP_IPC_CHANNELS.getTechnicalLogInfo, (): TechnicalLogInfo => {
    const info = getTechnicalLogInfo()
    logger.debug('IPC app:get-technical-log-info completed', { file: info.file })
    return info
  })
}
