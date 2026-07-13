import {
  CONFIG_SCHEMA_VERSION,
  type AppConfig,
  type DeviceConfig,
  type StreamProfileConfig
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

const isNullableString = (value: unknown): value is string | null => {
  return value === null || isString(value)
}

const isLoggerLevel = (value: unknown): value is AppConfig['logger']['level'] => {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
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
      isRecord(device) &&
      isString(device.id) &&
      isString(device.name) &&
      isString(device.address)
    )
  })

  if (!hasValidDevices || !Array.isArray(value.streamProfiles)) {
    return false
  }

  const hasValidProfiles = value.streamProfiles.every((profile) => {
    return (
      isRecord(profile) &&
      isString(profile.id) &&
      isString(profile.name) &&
      isBoolean(profile.noAudio) &&
      isString(profile.crop)
    )
  })

  if (!hasValidProfiles || !isRecord(value.settings)) {
    return false
  }

  if (
    !isNullableString(value.settings.activeDeviceId) ||
    !isNullableString(value.settings.activeStreamProfileId)
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

  const devices: DeviceConfig[] = value.devices.map((device) => ({
    id: device.id,
    name: device.name,
    address: device.address
  }))

  const streamProfiles: StreamProfileConfig[] = value.streamProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    noAudio: profile.noAudio,
    crop: profile.crop
  }))

  return {
    version: CONFIG_SCHEMA_VERSION,
    application: {
      displayName: value.application.displayName
    },
    devices,
    streamProfiles,
    settings: {
      activeDeviceId: value.settings.activeDeviceId,
      activeStreamProfileId: value.settings.activeStreamProfileId
    },
    logger: {
      level: value.logger.level,
      maxFileSizeBytes: value.logger.maxFileSizeBytes
    }
  }
}
