import type {
  ApplicationErrorCode,
  ApplicationMetadata,
  InstalledApplication
} from '@shared/contracts/applications.contracts'
import {
  didApplicationLaunch,
  isAndroidPackageName,
  parseLaunchableApplications
} from '@shared/tools/applications.parser'
import { buildDeviceAdbArgs, listAdbDevices } from '@main/infrastructure/adb/adb.service'
import { createBinaryResolverFromSettings } from '@main/infrastructure/binaries/binary-resolver'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { ApplicationMetadataService } from '@main/infrastructure/metadata/application-metadata.service'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'

const CATEGORIES = [
  'android.intent.category.LAUNCHER',
  'android.intent.category.LEANBACK_LAUNCHER',
  'android.intent.category.INFO'
]
export class ApplicationOperationError extends Error {
  public constructor(
    public readonly code: ApplicationErrorCode,
    message = code
  ) {
    super(message)
  }
}

export class ApplicationsService {
  private readonly catalogs = new Map<string, InstalledApplication[]>()
  private readonly launches = new Set<string>()
  public constructor(
    private readonly configuration: ConfigurationService,
    private readonly metadata: ApplicationMetadataService
  ) {}

  private async context(deviceId: unknown) {
    if (typeof deviceId !== 'string' || !deviceId.trim())
      throw new ApplicationOperationError('INVALID_REQUEST')
    const { config } = await this.configuration.load()
    const device = config.devices.find((item) => item.id === deviceId)
    if (!device) throw new ApplicationOperationError('DEVICE_NOT_FOUND')
    return { device: { ...device }, resolver: createBinaryResolverFromSettings(config.settings) }
  }

  private async discover(deviceId: string): Promise<InstalledApplication[]> {
    const { device, resolver } = await this.context(deviceId)
    const connected = await listAdbDevices(resolver)
    if (
      !connected.devices.some((item) => item.serial === device.address && item.state === 'device')
    )
      throw new ApplicationOperationError('DEVICE_NOT_CONNECTED')
    const byPackage = new Map<string, InstalledApplication>()
    let succeeded = false
    for (const category of CATEGORIES) {
      const result = await runCommand(
        resolver.adb(),
        buildDeviceAdbArgs(device.address, [
          'shell',
          'cmd',
          'package',
          'query-activities',
          '--components',
          '--user',
          'current',
          '-a',
          'android.intent.action.MAIN',
          '-c',
          category
        ]),
        { timeoutMs: 15_000 }
      )
      if (
        result.exitCode !== 0 ||
        /(?:Error:|Exception|Unknown command|Permission Denial)/i.test(
          result.stdout + result.stderr
        )
      )
        continue
      succeeded = true
      for (const application of parseLaunchableApplications(result.stdout, category)) {
        if (!byPackage.has(application.packageName))
          byPackage.set(application.packageName, application)
      }
    }
    if (!succeeded) throw new ApplicationOperationError('LIST_FAILED')
    const current = await this.context(deviceId)
    if (current.device.address !== device.address)
      throw new ApplicationOperationError('DEVICE_NOT_CONNECTED')
    const apps = [...byPackage.values()].sort((a, b) => a.packageName.localeCompare(b.packageName))
    this.catalogs.set(device.address, apps)
    return apps
  }

  public async list(deviceId: string): Promise<InstalledApplication[]> {
    const apps = await this.discover(deviceId)
    return Promise.all(
      apps.map(async (application) => {
        const metadata = await this.metadata.get(application.packageName)
        return {
          ...application,
          name: metadata.name ?? application.name,
          imageDataUrl: metadata.imageDataUrl
        }
      })
    )
  }

  public async artwork(deviceId: string, packageName: unknown): Promise<ApplicationMetadata> {
    if (!isAndroidPackageName(packageName)) throw new ApplicationOperationError('INVALID_REQUEST')
    const { device } = await this.context(deviceId)
    if (!this.catalogs.get(device.address)?.some((item) => item.packageName === packageName))
      throw new ApplicationOperationError('APP_NOT_FOUND')
    return this.metadata.get(packageName, true)
  }

  public async launch(deviceId: string, packageName: unknown): Promise<{ packageName: string }> {
    if (!isAndroidPackageName(packageName)) throw new ApplicationOperationError('INVALID_REQUEST')
    if (this.launches.has(deviceId)) throw new ApplicationOperationError('LAUNCH_FAILED')
    this.launches.add(deviceId)
    try {
      // Re-query at launch: never accept arbitrary components from the renderer or stale installs.
      const initial = await this.context(deviceId)
      const apps = await this.discover(deviceId)
      const application = apps.find((item) => item.packageName === packageName)
      if (!application) throw new ApplicationOperationError('APP_NOT_FOUND')
      const { device, resolver } = await this.context(deviceId)
      if (device.address !== initial.device.address)
        throw new ApplicationOperationError('DEVICE_NOT_CONNECTED')
      const result = await runCommand(
        resolver.adb(),
        buildDeviceAdbArgs(device.address, [
          'shell',
          'am',
          'start',
          '--user',
          'current',
          '-W',
          '-a',
          'android.intent.action.MAIN',
          '-c',
          application.category,
          '-n',
          application.component
        ]),
        { timeoutMs: 30_000 }
      )
      if (!didApplicationLaunch(result.exitCode, result.stdout, result.stderr))
        throw new ApplicationOperationError('LAUNCH_FAILED')
      return { packageName }
    } finally {
      this.launches.delete(deviceId)
    }
  }
}
