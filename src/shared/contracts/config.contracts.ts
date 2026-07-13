export const CONFIG_SCHEMA_VERSION = 1

export const CONFIG_IPC_CHANNELS = {
  getConfig: 'config:get',
  resetConfig: 'config:reset',
  addDevice: 'config:devices:add',
  updateDevice: 'config:devices:update',
  deleteDevice: 'config:devices:delete',
  updateLanguage: 'config:settings:language:update',
  updateSettings: 'config:settings:update',
  addStreamProfile: 'config:stream-profiles:add',
  updateStreamProfile: 'config:stream-profiles:update',
  deleteStreamProfile: 'config:stream-profiles:delete'
} as const

export interface ApplicationConfig {
  displayName: string
}

export interface DeviceConfig {
  id: string
  name: string
  address: string
  streamProfileId: string | null
}

export type NewDeviceConfig = DeviceConfig
export type DeviceConfigUpdate = Partial<Omit<DeviceConfig, 'id'>>

export interface StreamProfileConfig {
  id: string
  name: string
  description: string
  noAudio: boolean
  crop: string
  maxSize: number | null
  maxFps: number | null
  videoBitRate: string
  videoCodec: 'h264' | 'h265'
}

export type NewStreamProfileConfig = StreamProfileConfig
export type StreamProfileConfigUpdate = Partial<Omit<StreamProfileConfig, 'id'>>

export interface UserSettingsConfig {
  activeDeviceId: string | null
  activeStreamProfileId: string | null
  language: AppLanguage
  autoReconnect: boolean
  launchAtStartup: boolean
  closeBehavior: CloseBehavior
  runtimePollingIntervalSeconds: number
  adbSource: ToolBinarySource
  adbPath: string
  scrcpySource: ToolBinarySource
  scrcpyPath: string
  logLevel: ConfigLogLevel
  verboseLogging: boolean
}

export type AppLanguage = 'en' | 'ru'
export type ToolBinarySource = 'system' | 'bundled' | 'custom'
export type CloseBehavior = 'quit' | 'minimizeToTray' | 'ask'
export type UserSettingsUpdate = Partial<UserSettingsConfig>

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
  resetConfig: () => Promise<ConfigurationResult>
  addDevice: (device: NewDeviceConfig) => Promise<ConfigurationResult>
  updateDevice: (id: string, changes: DeviceConfigUpdate) => Promise<ConfigurationResult>
  deleteDevice: (id: string) => Promise<ConfigurationResult>
  updateLanguage: (language: AppLanguage) => Promise<ConfigurationResult>
  updateSettings: (changes: UserSettingsUpdate) => Promise<ConfigurationResult>
  addStreamProfile: (profile: NewStreamProfileConfig) => Promise<ConfigurationResult>
  updateStreamProfile: (id: string, changes: StreamProfileConfigUpdate) => Promise<ConfigurationResult>
  deleteStreamProfile: (id: string) => Promise<ConfigurationResult>
}
