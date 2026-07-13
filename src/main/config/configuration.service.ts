import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { createDefaultConfig } from '../../shared/config/default-config'
import { normalizeAppConfig } from '../../shared/config/config.validation'
import type {
  AppConfig,
  ConfigurationFileInfo,
  ConfigurationState
} from '../../shared/contracts/config.contracts'
import { logger } from '../logger/logger'

const CONFIG_FILE_NAME = 'config.json'

const serializeConfig = (config: AppConfig): string => {
  return `${JSON.stringify(config, null, 2)}\n`
}

export class ConfigurationService {
  private config: AppConfig | null = null

  public constructor(private readonly directoryProvider = (): string => app.getPath('userData')) {}

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
        this.config = createDefaultConfig()
        await this.save(this.config)
        return this.get()
      }

      logger.errorWithCause('Configuration load failed; restoring defaults', error, {
        file: fileInfo.file
      })
      await this.backupCorruptedConfig(fileInfo.file)
      this.config = createDefaultConfig()
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

  public async resetToDefault(): Promise<ConfigurationState> {
    logger.warn('Resetting configuration to defaults')
    this.config = createDefaultConfig()
    return this.save(this.config)
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
