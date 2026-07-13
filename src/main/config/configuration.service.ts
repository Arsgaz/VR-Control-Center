import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { createDefaultConfig, resolveLanguageFromLocale } from '../../shared/config/default-config'
import {
  isDeviceAddress,
  isDeviceConfigUpdate,
  isAppLanguage,
  isUserSettingsUpdate,
  isNewDeviceConfig,
  isNewStreamProfileConfig,
  isStreamProfileConfigUpdate,
  normalizeAppConfig
} from '../../shared/config/config.validation'
import type {
  AppConfig,
  AppLanguage,
  ConfigurationFileInfo,
  ConfigurationState,
  DeviceConfigUpdate,
  NewDeviceConfig,
  NewStreamProfileConfig,
  StreamProfileConfigUpdate,
  UserSettingsUpdate
} from '../../shared/contracts/config.contracts'
import { applyLoggerSettings, logger } from '../logger/logger'

const CONFIG_FILE_NAME = 'config.json'

const serializeConfig = (config: AppConfig): string => {
  return `${JSON.stringify(config, null, 2)}\n`
}

const normalizeAddress = (address: string): string => {
  return address.trim()
}

const normalizeProfileName = (name: string): string => {
  return name.trim().toLocaleLowerCase()
}

export class ConfigurationService {
  private config: AppConfig | null = null

  public constructor(
    private readonly directoryProvider = (): string => app.getPath('userData'),
    private readonly localeProvider = (): string => app.getLocale(),
    private readonly packagedProvider = (): boolean => app.isPackaged
  ) {}

  private createDefaultConfigForSystemLocale(): AppConfig {
    return createDefaultConfig(resolveLanguageFromLocale(this.localeProvider()), {
      verboseLogging: !this.packagedProvider()
    })
  }

  public getFileInfo(): ConfigurationFileInfo {
    const directory = this.directoryProvider()
    return {
      directory,
      file: join(directory, CONFIG_FILE_NAME)
    }
  }

  public async load(): Promise<ConfigurationState> {
    const fileInfo = this.getFileInfo()
    logger.info('Loading configuration', { file: fileInfo.file })
    await mkdir(fileInfo.directory, { recursive: true })

    try {
      const rawConfig = await readFile(fileInfo.file, 'utf8')
      const parsedConfig: unknown = JSON.parse(rawConfig)

      const normalizedConfig = normalizeAppConfig(parsedConfig)
      if (!normalizedConfig) {
        throw new Error('Configuration schema is invalid')
      }

      this.config = normalizedConfig
      if (rawConfig !== serializeConfig(normalizedConfig)) {
        logger.info('Saving normalized configuration after load', { file: fileInfo.file })
        await this.save(normalizedConfig)
      }

      logger.info('Configuration loaded', {
        version: normalizedConfig.version,
        devices: normalizedConfig.devices.length,
        streamProfiles: normalizedConfig.streamProfiles.length
      })
      return this.get()
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        logger.info('Configuration file does not exist; creating default configuration', {
          file: fileInfo.file
        })
        this.config = this.createDefaultConfigForSystemLocale()
        await this.save(this.config)
        return this.get()
      }

      logger.errorWithCause('Configuration load failed; restoring defaults', error, {
        file: fileInfo.file
      })
      await this.backupCorruptedConfig(fileInfo.file)
      this.config = this.createDefaultConfigForSystemLocale()
      await this.save(this.config)
      return this.get()
    }
  }

  public async save(config = this.requireConfig()): Promise<ConfigurationState> {
    const normalizedConfig = normalizeAppConfig(config)
    if (!normalizedConfig) {
      logger.warn('Configuration save rejected: invalid schema')
      throw new Error('Configuration schema is invalid')
    }

    const fileInfo = this.getFileInfo()
    logger.info('Saving configuration', {
      file: fileInfo.file,
      devices: normalizedConfig.devices.length,
      streamProfiles: normalizedConfig.streamProfiles.length
    })
    await mkdir(dirname(fileInfo.file), { recursive: true })

    try {
      await writeFile(fileInfo.file, serializeConfig(normalizedConfig), 'utf8')
      this.config = normalizedConfig
      logger.info('Configuration saved', { file: fileInfo.file })
      return this.get()
    } catch (error) {
      logger.errorWithCause('Configuration save failed', error, { file: fileInfo.file })
      throw new Error('Configuration could not be saved')
    }
  }

  public get(): ConfigurationState {
    return {
      config: this.requireConfig(),
      file: this.getFileInfo()
    }
  }

  public async update(updater: (config: AppConfig) => AppConfig): Promise<ConfigurationState> {
    const currentConfig = this.requireConfig()
    const nextConfig = updater(structuredClone(currentConfig))

    const normalizedConfig = normalizeAppConfig(nextConfig)
    if (!normalizedConfig) {
      logger.warn('Configuration update rejected: invalid schema')
      throw new Error('Configuration schema is invalid')
    }

    logger.info('Updating configuration')
    return this.save(normalizedConfig)
  }

  public async addDevice(device: NewDeviceConfig): Promise<ConfigurationState> {
    if (!isNewDeviceConfig(device)) {
      throw new Error('Device payload is invalid')
    }

    await this.load()
    logger.info('Adding device configuration', { deviceId: device.id })

    return this.update((config) => {
      if (config.devices.some((existingDevice) => existingDevice.id === device.id)) {
        throw new Error(`Device already exists: ${device.id}`)
      }

      const address = normalizeAddress(device.address)
      if (config.devices.some((existingDevice) => existingDevice.address.trim() === address)) {
        throw new Error(`Device address already exists: ${address}`)
      }

      if (
        device.streamProfileId !== null &&
        !config.streamProfiles.some((profile) => profile.id === device.streamProfileId)
      ) {
        throw new Error(`Unknown stream profile id: ${device.streamProfileId}`)
      }

      return {
        ...config,
        devices: [
          ...config.devices,
          {
            ...device,
            address
          }
        ],
        settings: {
          ...config.settings,
          activeDeviceId: config.settings.activeDeviceId ?? device.id
        }
      }
    })
  }

  public async updateDevice(
    id: string,
    changes: DeviceConfigUpdate
  ): Promise<ConfigurationState> {
    if (!id.trim() || !isDeviceConfigUpdate(changes)) {
      throw new Error('Device update payload is invalid')
    }

    await this.load()
    logger.info('Updating device configuration', { deviceId: id })

    return this.update((config) => {
      const deviceExists = config.devices.some((device) => device.id === id)
      if (!deviceExists) {
        throw new Error(`Unknown device id: ${id}`)
      }

      const nextAddress = changes.address?.trim()
      const nextName = changes.name?.trim()
      if (nextName !== undefined && !nextName) {
        throw new Error('Device name is required')
      }

      if (nextAddress !== undefined) {
        if (!isDeviceAddress(nextAddress)) {
          throw new Error('Device address is invalid')
        }

        if (
          config.devices.some(
            (device) => device.id !== id && device.address.trim() === nextAddress
          )
        ) {
          throw new Error(`Device address already exists: ${nextAddress}`)
        }
      }

      if (
        changes.streamProfileId !== undefined &&
        changes.streamProfileId !== null &&
        !config.streamProfiles.some((profile) => profile.id === changes.streamProfileId)
      ) {
        throw new Error(`Unknown stream profile id: ${changes.streamProfileId}`)
      }

      return {
        ...config,
        devices: config.devices.map((device) =>
          device.id === id
            ? {
                ...device,
                ...changes,
                name: nextName ?? device.name,
                address: nextAddress ?? device.address
              }
            : device
        )
      }
    })
  }

  public async deleteDevice(id: string): Promise<ConfigurationState> {
    if (!id.trim()) {
      throw new Error('Device id is required')
    }

    await this.load()
    logger.info('Deleting device configuration', { deviceId: id })

    return this.update((config) => {
      const deviceExists = config.devices.some((device) => device.id === id)
      if (!deviceExists) {
        throw new Error(`Unknown device id: ${id}`)
      }

      const devices = config.devices.filter((device) => device.id !== id)
      const nextActiveDeviceId =
        config.settings.activeDeviceId === id
          ? (devices[0]?.id ?? null)
          : config.settings.activeDeviceId

      return {
        ...config,
        devices,
        settings: {
          ...config.settings,
          activeDeviceId: nextActiveDeviceId
        }
      }
    })
  }

  public async updateLanguage(language: AppLanguage): Promise<ConfigurationState> {
    if (!isAppLanguage(language)) {
      throw new Error('Language payload is invalid')
    }

    await this.load()
    logger.info('Updating application language', { language })

    return this.update((config) => ({
      ...config,
      settings: {
        ...config.settings,
        language
      }
    }))
  }

  public async updateSettings(changes: UserSettingsUpdate): Promise<ConfigurationState> {
    if (!isUserSettingsUpdate(changes)) {
      throw new Error('Settings update payload is invalid')
    }

    await this.load()
    logger.info('Updating application settings', {
      keys: Object.keys(changes)
    })

    const state = await this.update((config) => ({
      ...config,
      settings: {
        ...config.settings,
        ...changes,
        adbPath: changes.adbPath?.trim() ?? config.settings.adbPath,
        scrcpyPath: changes.scrcpyPath?.trim() ?? config.settings.scrcpyPath
      },
      logger: {
        ...config.logger,
        level: changes.logLevel ?? config.logger.level
      }
    }))

    applyLoggerSettings(state.config.settings.logLevel, state.config.settings.verboseLogging)
    return state
  }

  public async addStreamProfile(profile: NewStreamProfileConfig): Promise<ConfigurationState> {
    if (!isNewStreamProfileConfig(profile)) {
      throw new Error('Stream profile payload is invalid')
    }

    await this.load()
    logger.info('Adding stream profile configuration', { profileId: profile.id })

    return this.update((config) => {
      if (config.streamProfiles.some((existingProfile) => existingProfile.id === profile.id)) {
        throw new Error(`Stream profile already exists: ${profile.id}`)
      }

      if (
        config.streamProfiles.some(
          (existingProfile) =>
            normalizeProfileName(existingProfile.name) === normalizeProfileName(profile.name)
        )
      ) {
        throw new Error(`Stream profile name already exists: ${profile.name}`)
      }

      return {
        ...config,
        streamProfiles: [
          ...config.streamProfiles,
          {
            ...profile,
            name: profile.name.trim(),
            description: profile.description.trim(),
            crop: profile.crop.trim(),
            videoBitRate: profile.videoBitRate.trim()
          }
        ],
        settings: {
          ...config.settings,
          activeStreamProfileId: config.settings.activeStreamProfileId ?? profile.id
        }
      }
    })
  }

  public async updateStreamProfile(
    id: string,
    changes: StreamProfileConfigUpdate
  ): Promise<ConfigurationState> {
    if (!id.trim() || !isStreamProfileConfigUpdate(changes)) {
      throw new Error('Stream profile update payload is invalid')
    }

    await this.load()
    logger.info('Updating stream profile configuration', { profileId: id })

    return this.update((config) => {
      const profileExists = config.streamProfiles.some((profile) => profile.id === id)
      if (!profileExists) {
        throw new Error(`Unknown stream profile id: ${id}`)
      }

      const nextName = changes.name?.trim()
      if (nextName !== undefined && !nextName) {
        throw new Error('Stream profile name is required')
      }

      if (
        nextName !== undefined &&
        config.streamProfiles.some(
          (profile) =>
            profile.id !== id && normalizeProfileName(profile.name) === normalizeProfileName(nextName)
        )
      ) {
        throw new Error(`Stream profile name already exists: ${nextName}`)
      }

      return {
        ...config,
        streamProfiles: config.streamProfiles.map((profile) =>
          profile.id === id
            ? {
                ...profile,
                ...changes,
                name: nextName ?? profile.name,
                description: changes.description?.trim() ?? profile.description,
                crop: changes.crop?.trim() ?? profile.crop,
                videoBitRate: changes.videoBitRate?.trim() ?? profile.videoBitRate
              }
            : profile
        )
      }
    })
  }

  public async deleteStreamProfile(id: string): Promise<ConfigurationState> {
    if (!id.trim()) {
      throw new Error('Stream profile id is required')
    }

    await this.load()
    logger.info('Deleting stream profile configuration', { profileId: id })

    return this.update((config) => {
      const profileExists = config.streamProfiles.some((profile) => profile.id === id)
      if (!profileExists) {
        throw new Error(`Unknown stream profile id: ${id}`)
      }

      const usedByDevices = config.devices.filter((device) => device.streamProfileId === id)
      if (usedByDevices.length > 0) {
        throw new Error(`Stream profile is used by ${usedByDevices.length} device(s)`)
      }

      const streamProfiles = config.streamProfiles.filter((profile) => profile.id !== id)
      const nextActiveStreamProfileId =
        config.settings.activeStreamProfileId === id
          ? (streamProfiles[0]?.id ?? null)
          : config.settings.activeStreamProfileId

      return {
        ...config,
        streamProfiles,
        settings: {
          ...config.settings,
          activeStreamProfileId: nextActiveStreamProfileId
        }
      }
    })
  }

  public async resetToDefault(): Promise<ConfigurationState> {
    logger.warn('Resetting configuration to defaults')
    this.config = this.createDefaultConfigForSystemLocale()
    const state = await this.save(this.config)
    applyLoggerSettings(state.config.settings.logLevel, state.config.settings.verboseLogging)
    return state
  }

  private requireConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration is not loaded')
    }

    return this.config
  }

  private async backupCorruptedConfig(file: string): Promise<void> {
    const backupFile = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`

    try {
      await rename(file, backupFile)
      logger.warn('Corrupted configuration backed up', { file, backupFile })
    } catch (error) {
      logger.errorWithCause('Failed to backup corrupted configuration', error, { file, backupFile })
    }
  }
}

export const configurationService = new ConfigurationService()
