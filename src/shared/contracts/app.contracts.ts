import type { HeadsetApi } from './headset.contracts'
import type { ConfigurationApi } from './config.contracts'

export const APP_IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
  getTechnicalLogInfo: 'app:get-technical-log-info',
  selectToolBinary: 'app:select-tool-binary',
  openLogsDirectory: 'app:logs:open-directory',
  clearOldLogs: 'app:logs:clear-old'
} as const

export type AppIpcChannel = (typeof APP_IPC_CHANNELS)[keyof typeof APP_IPC_CHANNELS]

export interface AppInfo {
  appName: string
  appVersion: string
  platform: 'win32' | 'darwin' | 'linux'
  arch: string
  electronVersion: string
  nodeVersion: string
}

export interface TechnicalLogInfo {
  directory: string
  file: string
}

export type ToolBinaryKind = 'adb' | 'scrcpy'

export interface SelectToolBinaryResult {
  canceled: boolean
  path: string | null
}

export interface ClearOldLogsResult {
  deletedFiles: number
}

export interface VrControlApi {
  getAppInfo: () => Promise<AppInfo>
  getTechnicalLogInfo: () => Promise<TechnicalLogInfo>
  selectToolBinary: (tool: ToolBinaryKind) => Promise<SelectToolBinaryResult>
  openLogsDirectory: () => Promise<void>
  clearOldLogs: () => Promise<ClearOldLogsResult>
  configuration: ConfigurationApi
  headset: HeadsetApi
}
