import type { HeadsetApi } from './headset.contracts'
import type { ConfigurationApi } from './config.contracts'

export const APP_IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
  getTechnicalLogInfo: 'app:get-technical-log-info'
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

export interface VrControlApi {
  getAppInfo: () => Promise<AppInfo>
  getTechnicalLogInfo: () => Promise<TechnicalLogInfo>
  configuration: ConfigurationApi
  headset: HeadsetApi
}
