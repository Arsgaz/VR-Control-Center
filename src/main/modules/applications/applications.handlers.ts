import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  APPLICATIONS_IPC_CHANNELS,
  type ApplicationErrorCode,
  type ApplicationResult
} from '@shared/contracts/applications.contracts'
import { ApplicationMetadataService } from '@main/infrastructure/metadata/application-metadata.service'
import { logger } from '@main/infrastructure/logging/logger'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import { ApplicationOperationError, ApplicationsService } from './applications.service'

export const registerApplicationsHandlers = (
  configuration: ConfigurationService,
  runtime: HeadsetRuntimeManager
): void => {
  const metadata = new ApplicationMetadataService(
    join(app.getPath('userData'), 'application-artwork')
  )
  const service = new ApplicationsService(configuration, metadata)
  const handle = async <T>(
    task: () => Promise<T>,
    fallback: ApplicationErrorCode
  ): Promise<ApplicationResult<T>> => {
    try {
      return { ok: true, value: await task() }
    } catch (error) {
      logger.errorWithCause('Application library operation failed', error)
      return {
        ok: false,
        error: { code: error instanceof ApplicationOperationError ? error.code : fallback }
      }
    }
  }
  ipcMain.handle(APPLICATIONS_IPC_CHANNELS.list, (_, deviceId: string) =>
    handle(() => service.list(deviceId), 'LIST_FAILED')
  )
  ipcMain.handle(APPLICATIONS_IPC_CHANNELS.artwork, (_, deviceId: string, packageName: string) =>
    handle(() => service.artwork(deviceId, packageName), 'ARTWORK_FAILED')
  )
  ipcMain.handle(APPLICATIONS_IPC_CHANNELS.launch, (_, deviceId: string, packageName: string) =>
    handle(async () => {
      const result = await service.launch(deviceId, packageName)
      void runtime
        .refreshRuntime(deviceId)
        .catch((error) => logger.errorWithCause('Post-launch runtime refresh failed', error))
      return result
    }, 'LAUNCH_FAILED')
  )
}
