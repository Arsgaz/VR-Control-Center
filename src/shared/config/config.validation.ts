import {
  CONFIG_SCHEMA_VERSION,
  type AppConfig,
  type DeviceConfig,
  type DeviceConfigUpdate,
  type NewDeviceConfig,
  type NewStreamProfileConfig,
  type StreamProfileConfig,
  type StreamProfileConfigUpdate,
  type UserSettingsConfig,
  type UserSettingsUpdate
} from '../contracts/config.contracts'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (value: unknown): value is string => {
  return typeof value === 'string'
}

const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean'
}

const isNullablePositiveInteger = (value: unknown): value is number | null => {
  return value === null || (Number.isInteger(value) && typeof value === 'number' && value > 0)
}

const isNullableString = (value: unknown): value is string | null => {
  return value === null || isString(value)
}

const isLoggerLevel = (value: unknown): value is AppConfig['logger']['level'] => {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

export const isAppLanguage = (value: unknown): value is AppConfig['settings']['language'] => {
  return value === 'en' || value === 'ru'
}

export const isToolBinarySource = (
  value: unknown
): value is AppConfig['settings']['adbSource'] => {
  return value === 'system' || value === 'bundled' || value === 'custom'
}

export const isCloseBehavior = (
  value: unknown
): value is AppConfig['settings']['closeBehavior'] => {
  return value === 'quit' || value === 'minimizeToTray' || value === 'ask'
}

export const isRuntimePollingIntervalSeconds = (value: unknown): value is number => {
  return Number.isInteger(value) && typeof value === 'number' && value >= 5 && value <= 30
}

const isLegacyDefaultDevice = (device: DeviceConfig): boolean => {
  return (
    device.id === 'test-headset' &&
    device.name === 'Test headset' &&
    device.address === '192.168.1.100:5555'
  )
}

export const isDeviceAddress = (value: string): boolean => {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,3})){3}:(\d{1,5})$/)
  if (!match) {
    return false
  }

  const [ip, portText] = value.trim().split(':')
  const octets = ip.split('.').map(Number)
  const port = Number(portText)

  return octets.every((octet) => octet >= 0 && octet <= 255) && port >= 1 && port <= 65535
}

export const isStreamProfileCrop = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }

  const parts = trimmed.split(':')
  if (parts.length !== 4) {
    return false
  }

  if (!parts.every((part) => /^\d+$/.test(part))) {
    return false
  }

  const [width, height, x, y] = parts.map(Number)
  return width > 0 && height > 0 && x >= 0 && y >= 0
}

export const isStreamProfileMaxSize = (value: number | null): boolean => {
  return value === null || (Number.isInteger(value) && value > 0)
}

export const isStreamProfileMaxFps = (value: number | null): boolean => {
  return value === null || (Number.isInteger(value) && value > 0)
}

export const isStreamProfileVideoBitRate = (value: string): boolean => {
  const trimmed = value.trim()
  return !trimmed || /^\d+(?:\.\d+)?[KkMmGg]?$/.test(trimmed)
}

export const isStreamProfileVideoCodec = (
  value: unknown
): value is StreamProfileConfig['videoCodec'] => {
  return value === 'h264' || value === 'h265'
}

export const isNewDeviceConfig = (value: unknown): value is NewDeviceConfig => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isString(value.address) &&
    isDeviceAddress(value.address) &&
    isNullableString(value.streamProfileId)
  )
}

const isStoredDeviceConfig = (value: unknown): value is DeviceConfig | Omit<DeviceConfig, 'streamProfileId'> => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isString(value.address) &&
    isDeviceAddress(value.address) &&
    (value.streamProfileId === undefined || isNullableString(value.streamProfileId))
  )
}

export const isDeviceConfigUpdate = (value: unknown): value is DeviceConfigUpdate => {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.name === undefined || isString(value.name)) &&
    (value.address === undefined || (isString(value.address) && isDeviceAddress(value.address))) &&
    (value.streamProfileId === undefined || isNullableString(value.streamProfileId))
  )
}

export const isNewStreamProfileConfig = (value: unknown): value is NewStreamProfileConfig => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isString(value.description) &&
    isBoolean(value.noAudio) &&
    isString(value.crop) &&
    isStreamProfileCrop(value.crop) &&
    isNullablePositiveInteger(value.maxSize) &&
    isNullablePositiveInteger(value.maxFps) &&
    isString(value.videoBitRate) &&
    isStreamProfileVideoBitRate(value.videoBitRate) &&
    isStreamProfileVideoCodec(value.videoCodec)
  )
}

const isStoredStreamProfileConfig = (value: unknown): value is Partial<StreamProfileConfig> & Pick<StreamProfileConfig, 'id' | 'name' | 'noAudio' | 'crop'> => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isBoolean(value.noAudio) &&
    isString(value.crop) &&
    isStreamProfileCrop(value.crop) &&
    (value.description === undefined || isString(value.description)) &&
    (value.maxSize === undefined || isNullablePositiveInteger(value.maxSize)) &&
    (value.maxFps === undefined || isNullablePositiveInteger(value.maxFps)) &&
    (value.videoBitRate === undefined ||
      (isString(value.videoBitRate) && isStreamProfileVideoBitRate(value.videoBitRate))) &&
    (value.videoCodec === undefined || isStreamProfileVideoCodec(value.videoCodec))
  )
}

export const isStreamProfileConfigUpdate = (
  value: unknown
): value is StreamProfileConfigUpdate => {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.name === undefined || isString(value.name)) &&
    (value.description === undefined || isString(value.description)) &&
    (value.noAudio === undefined || isBoolean(value.noAudio)) &&
    (value.crop === undefined || (isString(value.crop) && isStreamProfileCrop(value.crop))) &&
    (value.maxSize === undefined ||
      (isNullablePositiveInteger(value.maxSize) && isStreamProfileMaxSize(value.maxSize))) &&
    (value.maxFps === undefined ||
      (isNullablePositiveInteger(value.maxFps) && isStreamProfileMaxFps(value.maxFps))) &&
    (value.videoBitRate === undefined ||
      (isString(value.videoBitRate) && isStreamProfileVideoBitRate(value.videoBitRate))) &&
    (value.videoCodec === undefined || isStreamProfileVideoCodec(value.videoCodec))
  )
}

export const isUserSettingsUpdate = (value: unknown): value is UserSettingsUpdate => {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.activeDeviceId === undefined || isNullableString(value.activeDeviceId)) &&
    (value.activeStreamProfileId === undefined || isNullableString(value.activeStreamProfileId)) &&
    (value.language === undefined || isAppLanguage(value.language)) &&
    (value.autoReconnect === undefined || isBoolean(value.autoReconnect)) &&
    (value.launchAtStartup === undefined || isBoolean(value.launchAtStartup)) &&
    (value.closeBehavior === undefined || isCloseBehavior(value.closeBehavior)) &&
    (value.runtimePollingIntervalSeconds === undefined ||
      isRuntimePollingIntervalSeconds(value.runtimePollingIntervalSeconds)) &&
    (value.adbSource === undefined || isToolBinarySource(value.adbSource)) &&
    (value.adbPath === undefined || isString(value.adbPath)) &&
    (value.scrcpySource === undefined || isToolBinarySource(value.scrcpySource)) &&
    (value.scrcpyPath === undefined || isString(value.scrcpyPath)) &&
    (value.logLevel === undefined || isLoggerLevel(value.logLevel)) &&
    (value.verboseLogging === undefined || isBoolean(value.verboseLogging))
  )
}

export const isAppConfig = (value: unknown): value is AppConfig => {
  if (!isRecord(value) || value.version !== CONFIG_SCHEMA_VERSION) {
    return false
  }

  if (!isRecord(value.application) || !isString(value.application.displayName)) {
    return false
  }

  if (!Array.isArray(value.devices)) {
    return false
  }

  const hasValidDevices = value.devices.every((device) => {
    return (
      isStoredDeviceConfig(device)
    )
  })

  if (!hasValidDevices || !Array.isArray(value.streamProfiles)) {
    return false
  }

  const hasValidProfiles = value.streamProfiles.every((profile) => {
    return isStoredStreamProfileConfig(profile)
  })

  if (!hasValidProfiles || !isRecord(value.settings)) {
    return false
  }

  if (
    !isNullableString(value.settings.activeDeviceId) ||
    !isNullableString(value.settings.activeStreamProfileId) ||
    (value.settings.language !== undefined && !isAppLanguage(value.settings.language)) ||
    (value.settings.autoReconnect !== undefined && !isBoolean(value.settings.autoReconnect)) ||
    (value.settings.launchAtStartup !== undefined && !isBoolean(value.settings.launchAtStartup)) ||
    (value.settings.closeBehavior !== undefined && !isCloseBehavior(value.settings.closeBehavior)) ||
    (value.settings.runtimePollingIntervalSeconds !== undefined &&
      !isRuntimePollingIntervalSeconds(value.settings.runtimePollingIntervalSeconds)) ||
    (value.settings.adbSource !== undefined && !isToolBinarySource(value.settings.adbSource)) ||
    (value.settings.adbPath !== undefined && !isString(value.settings.adbPath)) ||
    (value.settings.scrcpySource !== undefined && !isToolBinarySource(value.settings.scrcpySource)) ||
    (value.settings.scrcpyPath !== undefined && !isString(value.settings.scrcpyPath)) ||
    (value.settings.logLevel !== undefined && !isLoggerLevel(value.settings.logLevel)) ||
    (value.settings.verboseLogging !== undefined && !isBoolean(value.settings.verboseLogging))
  ) {
    return false
  }

  return (
    isRecord(value.logger) &&
    isLoggerLevel(value.logger.level) &&
    typeof value.logger.maxFileSizeBytes === 'number' &&
    Number.isFinite(value.logger.maxFileSizeBytes) &&
    value.logger.maxFileSizeBytes > 0
  )
}

export const normalizeAppConfig = (value: unknown): AppConfig | null => {
  if (!isAppConfig(value)) {
    return null
  }

  const devices: DeviceConfig[] = value.devices
    .map((device) => ({
      id: device.id,
      name: device.name,
      address: device.address,
      streamProfileId:
        device.streamProfileId ??
        value.settings.activeStreamProfileId ??
        value.streamProfiles[0]?.id ??
        null
    }))
    .filter((device) => !isLegacyDefaultDevice(device))

  const streamProfiles: StreamProfileConfig[] = value.streamProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    description: profile.description ?? '',
    noAudio: profile.noAudio,
    crop: profile.crop,
    maxSize: profile.maxSize ?? null,
    maxFps: profile.maxFps ?? null,
    videoBitRate: profile.videoBitRate ?? '',
    videoCodec: profile.videoCodec ?? 'h264'
  }))

  const settings: UserSettingsConfig = {
    activeDeviceId:
      devices.some((device) => device.id === value.settings.activeDeviceId)
        ? value.settings.activeDeviceId
        : null,
    activeStreamProfileId: value.settings.activeStreamProfileId,
    language: value.settings.language ?? 'en',
    autoReconnect: value.settings.autoReconnect ?? true,
    launchAtStartup: value.settings.launchAtStartup ?? false,
    closeBehavior: value.settings.closeBehavior ?? 'quit',
    runtimePollingIntervalSeconds: value.settings.runtimePollingIntervalSeconds ?? 10,
    adbSource: value.settings.adbSource ?? 'system',
    adbPath: value.settings.adbPath ?? '',
    scrcpySource: value.settings.scrcpySource ?? 'system',
    scrcpyPath: value.settings.scrcpyPath ?? '',
    logLevel: value.settings.logLevel ?? value.logger.level,
    verboseLogging: value.settings.verboseLogging ?? false
  }

  return {
    version: CONFIG_SCHEMA_VERSION,
    application: {
      displayName: value.application.displayName
    },
    devices,
    streamProfiles,
    settings,
    logger: {
      level: value.logger.level,
      maxFileSizeBytes: value.logger.maxFileSizeBytes
    }
  }
}
