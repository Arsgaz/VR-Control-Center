export const CONFIG_SCHEMA_VERSION = 1

export const CONFIG_IPC_CHANNELS = {
  getConfig: 'config:get',
  updateConfig: 'config:update',
  resetConfig: 'config:reset'
} as const

export interface ApplicationConfig {
  displayName: string
}

export interface DeviceConfig {
  id: string
  name: string
  address: string
}

export interface StreamProfileConfig {
  id: string
  name: string
  noAudio: boolean
  crop: string
}

export interface UserSettingsConfig {
  activeDeviceId: string | null
  activeStreamProfileId: string | null
}

export type ConfigLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerConfig {
  level: ConfigLogLevel
  maxFileSizeBytes: number
}

export interface AppConfig {
  version: typeof CONFIG_SCHEMA_VERSION
  application: ApplicationConfig
  devices: DeviceConfig[]
  streamProfiles: StreamProfileConfig[]
  settings: UserSettingsConfig
  logger: LoggerConfig
}

export interface ConfigurationFileInfo {
  directory: string
  file: string
}

export interface ConfigurationState {
  config: AppConfig
  file: ConfigurationFileInfo
}

export interface ConfigurationError {
  code: 'CONFIG_READ_FAILED' | 'CONFIG_WRITE_FAILED' | 'CONFIG_INVALID'
  message: string
}

export type ConfigurationResult =
  | {
      ok: true
      state: ConfigurationState
    }
  | {
      ok: false
      error: ConfigurationError
    }

export interface ConfigurationApi {
  getConfig: () => Promise<ConfigurationResult>
  updateConfig: (config: AppConfig) => Promise<ConfigurationResult>
  resetConfig: () => Promise<ConfigurationResult>
}
