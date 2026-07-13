import { ipcMain } from 'electron'
import {
  isDeviceConfigUpdate,
  isAppLanguage,
  isUserSettingsUpdate,
  isNewDeviceConfig,
  isNewStreamProfileConfig,
  isStreamProfileConfigUpdate
} from '@shared/config/config.validation'
import {
  CONFIG_IPC_CHANNELS,
  type AppLanguage,
  type ConfigurationError,
  type ConfigurationResult,
  type DeviceConfigUpdate,
  type NewDeviceConfig,
  type NewStreamProfileConfig,
  type StreamProfileConfigUpdate,
  type UserSettingsUpdate
} from '@shared/contracts/config.contracts'
import type { ConfigurationService } from './configuration.service'
import { logger } from '@main/infrastructure/logging/logger'

const toConfigError = (
  code: ConfigurationError['code'],
  message: string
): ConfigurationResult => ({
  ok: false,
  error: {
    code,
    message
  }
})

export const registerConfigurationHandlers = (configurationService: ConfigurationService): void => {
  ipcMain.handle(CONFIG_IPC_CHANNELS.getConfig, (): ConfigurationResult => {
    try {
      const state = configurationService.get()
      logger.debug('IPC config:get completed', { file: state.file.file })
      return { ok: true, state }
    } catch (error) {
      logger.errorWithCause('IPC config:get failed', error)
      return toConfigError('CONFIG_READ_FAILED', 'Configuration could not be loaded')
    }
  })

  ipcMain.handle(CONFIG_IPC_CHANNELS.resetConfig, async (): Promise<ConfigurationResult> => {
    try {
      const state = await configurationService.resetToDefault()
      logger.debug('IPC config:reset completed', { file: state.file.file })
      return { ok: true, state }
    } catch (error) {
      logger.errorWithCause('IPC config:reset failed', error)
      return toConfigError('CONFIG_WRITE_FAILED', 'Configuration could not be reset')
    }
  })

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.addDevice,
    async (_, device: NewDeviceConfig): Promise<ConfigurationResult> => {
      try {
        if (!isNewDeviceConfig(device)) {
          return toConfigError('CONFIG_INVALID', 'Device payload is invalid')
        }

        const state = await configurationService.addDevice(device)
        logger.debug('IPC config:devices:add completed', { deviceId: device.id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:devices:add failed', error, { deviceId: device?.id })
        return toConfigError('CONFIG_WRITE_FAILED', 'Device could not be added')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.updateDevice,
    async (_, id: string, changes: DeviceConfigUpdate): Promise<ConfigurationResult> => {
      try {
        if (!id.trim() || !isDeviceConfigUpdate(changes)) {
          return toConfigError('CONFIG_INVALID', 'Device update payload is invalid')
        }

        const state = await configurationService.updateDevice(id, changes)
        logger.debug('IPC config:devices:update completed', { deviceId: id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:devices:update failed', error, { deviceId: id })
        return toConfigError('CONFIG_INVALID', 'Device could not be updated')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.deleteDevice,
    async (_, id: string): Promise<ConfigurationResult> => {
      try {
        if (!id.trim()) {
          return toConfigError('CONFIG_INVALID', 'Device id is required')
        }

        const state = await configurationService.deleteDevice(id)
        logger.debug('IPC config:devices:delete completed', { deviceId: id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:devices:delete failed', error, { deviceId: id })
        return toConfigError('CONFIG_INVALID', 'Device could not be deleted')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.updateLanguage,
    async (_, language: AppLanguage): Promise<ConfigurationResult> => {
      try {
        if (!isAppLanguage(language)) {
          return toConfigError('CONFIG_INVALID', 'Language payload is invalid')
        }

        const state = await configurationService.updateLanguage(language)
        logger.debug('IPC config:settings:language:update completed', { language })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:settings:language:update failed', error, { language })
        return toConfigError('CONFIG_INVALID', 'Language could not be updated')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.updateSettings,
    async (_, changes: UserSettingsUpdate): Promise<ConfigurationResult> => {
      try {
        if (!isUserSettingsUpdate(changes)) {
          return toConfigError('CONFIG_INVALID', 'Settings update payload is invalid')
        }

        const state = await configurationService.updateSettings(changes)
        logger.debug('IPC config:settings:update completed', { keys: Object.keys(changes) })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:settings:update failed', error)
        return toConfigError('CONFIG_INVALID', 'Settings could not be updated')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.addStreamProfile,
    async (_, profile: NewStreamProfileConfig): Promise<ConfigurationResult> => {
      try {
        if (!isNewStreamProfileConfig(profile)) {
          return toConfigError('CONFIG_INVALID', 'Stream profile payload is invalid')
        }

        const state = await configurationService.addStreamProfile(profile)
        logger.debug('IPC config:stream-profiles:add completed', { profileId: profile.id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:stream-profiles:add failed', error, {
          profileId: profile?.id
        })
        return toConfigError('CONFIG_WRITE_FAILED', 'Stream profile could not be added')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.updateStreamProfile,
    async (_, id: string, changes: StreamProfileConfigUpdate): Promise<ConfigurationResult> => {
      try {
        if (!id.trim() || !isStreamProfileConfigUpdate(changes)) {
          return toConfigError('CONFIG_INVALID', 'Stream profile update payload is invalid')
        }

        const state = await configurationService.updateStreamProfile(id, changes)
        logger.debug('IPC config:stream-profiles:update completed', { profileId: id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:stream-profiles:update failed', error, { profileId: id })
        return toConfigError('CONFIG_INVALID', 'Stream profile could not be updated')
      }
    }
  )

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.deleteStreamProfile,
    async (_, id: string): Promise<ConfigurationResult> => {
      try {
        if (!id.trim()) {
          return toConfigError('CONFIG_INVALID', 'Stream profile id is required')
        }

        const state = await configurationService.deleteStreamProfile(id)
        logger.debug('IPC config:stream-profiles:delete completed', { profileId: id })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:stream-profiles:delete failed', error, { profileId: id })
        return toConfigError('CONFIG_INVALID', 'Stream profile could not be deleted')
      }
    }
  )
}
