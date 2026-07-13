import { registerApplicationHandlers } from '@main/modules/application/app.handlers'
import { registerConfigurationHandlers } from '@main/modules/configuration/configuration.handlers'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { registerDeviceHandlers } from '@main/modules/devices/device.handlers'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import { registerStreamHandlers } from '@main/modules/streaming/stream.handlers'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'

export interface IpcDependencies {
  configurationService: ConfigurationService
  runtimeManager: HeadsetRuntimeManager
  scrcpyService: ScrcpyService
}

export const registerIpc = (dependencies: IpcDependencies): void => {
  registerApplicationHandlers()
  registerConfigurationHandlers(dependencies.configurationService)
  registerDeviceHandlers({
    configurationService: dependencies.configurationService,
    runtimeManager: dependencies.runtimeManager
  })
  registerStreamHandlers({
    runtimeManager: dependencies.runtimeManager,
    scrcpyService: dependencies.scrcpyService
  })
}
