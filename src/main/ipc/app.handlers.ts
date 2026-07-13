import { app, dialog, ipcMain, shell } from 'electron'
import {
  APP_IPC_CHANNELS,
  type AppInfo,
  type SelectToolBinaryResult,
  type TechnicalLogInfo,
  type ToolBinaryKind
} from '../../shared/contracts/app.contracts'
import { clearOldTechnicalLogs, getTechnicalLogInfo, logger } from '../logger/logger'

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

  ipcMain.handle(
    APP_IPC_CHANNELS.selectToolBinary,
    async (_, tool: ToolBinaryKind): Promise<SelectToolBinaryResult> => {
      const result = await dialog.showOpenDialog({
        title: tool === 'adb' ? 'Select ADB binary' : 'Select scrcpy binary',
        properties: ['openFile']
      })

      return {
        canceled: result.canceled,
        path: result.canceled ? null : (result.filePaths[0] ?? null)
      }
    }
  )

  ipcMain.handle(APP_IPC_CHANNELS.openLogsDirectory, async (): Promise<void> => {
    const info = getTechnicalLogInfo()
    const error = await shell.openPath(info.directory)
    if (error) {
      throw new Error(error)
    }
  })

  ipcMain.handle(APP_IPC_CHANNELS.clearOldLogs, async () => {
    const deletedFiles = await clearOldTechnicalLogs()
    logger.info('Old technical logs cleared', { deletedFiles })
    return { deletedFiles }
  })
}
