import type { HeadsetApi } from './headset.contracts'

export const APP_IPC_CHANNELS = {
  getAppInfo: 'app:get-info'
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

export interface ArenaApi {
  getAppInfo: () => Promise<AppInfo>
  headset: HeadsetApi
}
