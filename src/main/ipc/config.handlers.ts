import { ipcMain } from 'electron'
import { normalizeAppConfig } from '../../shared/config/config.validation'
import {
  CONFIG_IPC_CHANNELS,
  type AppConfig,
  type ConfigurationError,
  type ConfigurationResult
} from '../../shared/contracts/config.contracts'
import { configurationService } from '../config/configuration.service'
import { logger } from '../logger/logger'

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

export const registerConfigHandlers = (): void => {
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

  ipcMain.handle(
    CONFIG_IPC_CHANNELS.updateConfig,
    async (_, config: AppConfig): Promise<ConfigurationResult> => {
      try {
        const normalizedConfig = normalizeAppConfig(config)
        if (!normalizedConfig) {
          return toConfigError('CONFIG_INVALID', 'Configuration schema is invalid')
        }

        const state = await configurationService.update(() => normalizedConfig)
        logger.debug('IPC config:update completed', { file: state.file.file })
        return { ok: true, state }
      } catch (error) {
        logger.errorWithCause('IPC config:update failed', error)
        return toConfigError('CONFIG_WRITE_FAILED', 'Configuration could not be updated')
      }
    }
  )

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
}
